package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/deepch/vdk/av"
	"github.com/deepch/vdk/codec/h264parser"
	"github.com/deepch/vdk/format/rtsp"
	"github.com/grandcat/zeroconf"
)

// Camera represents a discovered camera
type Camera struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Model       string `json:"model"`
	IP          string `json:"ip"`
	Port        int    `json:"port"`
	RTSPUrl     string `json:"rtsp_url"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	HasPTZ      bool   `json:"has_ptz"`
}

// EdgeGateway manages the gateway operations
type EdgeGateway struct {
	cloudURL      string
	wsConn        *websocket.Conn
	wsLock        sync.Mutex
	cameras       map[string]*Camera
	camerasLock   sync.RWMutex
	streams       map[string]*CameraStream
	streamsLock   sync.RWMutex
	peerConns     map[string]*webrtc.PeerConnection
	peerConnsLock sync.RWMutex
}

// CameraStream manages RTSP to WebRTC conversion
type CameraStream struct {
	camera       *Camera
	rtspClient   *rtsp.RTSPClient
	videoTrack   *webrtc.TrackLocalStaticSample
	audioTrack   *webrtc.TrackLocalStaticSample
	stopChan     chan bool
	isRunning    bool
	runningLock  sync.Mutex
}

// Message types for WebSocket communication
type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type OfferMessage struct {
	CameraID string                    `json:"camera_id"`
	SDP      webrtc.SessionDescription `json:"sdp"`
}

type PTZCommand struct {
	CameraID string  `json:"camera_id"`
	Action   string  `json:"action"` // pan_left, pan_right, tilt_up, tilt_down, zoom_in, zoom_out, stop
	Speed    float64 `json:"speed"`  // 0.0 to 1.0
}

func NewEdgeGateway(cloudURL string) *EdgeGateway {
	return &EdgeGateway{
		cloudURL:  cloudURL,
		cameras:   make(map[string]*Camera),
		streams:   make(map[string]*CameraStream),
		peerConns: make(map[string]*webrtc.PeerConnection),
	}
}

// Start initializes and runs the edge gateway
func (eg *EdgeGateway) Start(ctx context.Context) error {
	// Connect to cloud orchestrator
	if err := eg.connectToCloud(); err != nil {
		return fmt.Errorf("failed to connect to cloud: %v", err)
	}

	// Start camera discovery
	go eg.discoverCameras(ctx)

	// Start WebSocket message handler
	go eg.handleWebSocketMessages(ctx)

	// Keep alive loop
	go eg.keepAlive(ctx)

	// Wait for context cancellation
	<-ctx.Done()
	eg.cleanup()
	return nil
}

// connectToCloud establishes WebSocket connection to cloud orchestrator
func (eg *EdgeGateway) connectToCloud() error {
	header := http.Header{}
	header.Add("X-Gateway-ID", getGatewayID())
	header.Add("X-Gateway-Version", "1.0.0")

	dialer := websocket.Dialer{
		HandshakeTimeout: 30 * time.Second,
	}

	conn, _, err := dialer.Dial(eg.cloudURL, header)
	if err != nil {
		return err
	}

	eg.wsLock.Lock()
	eg.wsConn = conn
	eg.wsLock.Unlock()

	log.Printf("Connected to cloud orchestrator at %s", eg.cloudURL)
	return nil
}

// discoverCameras uses mDNS/Bonjour to find Axis cameras
func (eg *EdgeGateway) discoverCameras(ctx context.Context) {
	resolver, err := zeroconf.NewResolver(nil)
	if err != nil {
		log.Printf("Failed to initialize mDNS resolver: %v", err)
		return
	}

	entries := make(chan *zeroconf.ServiceEntry)
	go func() {
		for entry := range entries {
			// Check if it's an Axis camera
			if strings.Contains(strings.ToLower(entry.Instance), "axis") ||
				strings.Contains(strings.ToLower(entry.Service), "axis") {
				eg.processDiscoveredCamera(entry)
			}
		}
	}()

	// Search for Axis cameras via mDNS
	services := []string{"_axis-video._tcp", "_rtsp._tcp", "_http._tcp"}
	for _, service := range services {
		go func(svc string) {
			err := resolver.Browse(ctx, svc, "local.", entries)
			if err != nil {
				log.Printf("Failed to browse %s: %v", svc, err)
			}
		}(service)
	}

	// Also scan common RTSP ports
	go eg.scanNetworkForCameras(ctx)
}

// processDiscoveredCamera processes a discovered camera
func (eg *EdgeGateway) processDiscoveredCamera(entry *zeroconf.ServiceEntry) {
	if len(entry.AddrIPv4) == 0 {
		return
	}

	ip := entry.AddrIPv4[0].String()
	camera := &Camera{
		ID:       fmt.Sprintf("axis-%s", strings.ReplaceAll(ip, ".", "-")),
		Name:     entry.Instance,
		IP:       ip,
		Port:     entry.Port,
		Username: os.Getenv("CAMERA_USERNAME"),
		Password: os.Getenv("CAMERA_PASSWORD"),
	}

	// Default credentials if not set
	if camera.Username == "" {
		camera.Username = "root"
	}
	if camera.Password == "" {
		camera.Password = "pass"
	}

	// Build RTSP URL
	camera.RTSPUrl = fmt.Sprintf("rtsp://%s:%s@%s:554/axis-media/media.amp",
		camera.Username, camera.Password, camera.IP)

	// Check if camera supports PTZ
	camera.HasPTZ = eg.checkPTZSupport(camera)

	eg.camerasLock.Lock()
	eg.cameras[camera.ID] = camera
	eg.camerasLock.Unlock()

	log.Printf("Discovered camera: %s at %s", camera.Name, camera.IP)

	// Notify cloud about new camera
	eg.notifyCameraStatus(camera, "discovered")
}

// scanNetworkForCameras scans local network for cameras on common ports
func (eg *EdgeGateway) scanNetworkForCameras(ctx context.Context) {
	interfaces, err := net.Interfaces()
	if err != nil {
		log.Printf("Failed to get network interfaces: %v", err)
		return
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP.To4() == nil {
				continue
			}

			// Scan subnet
			go eg.scanSubnet(ctx, ipNet)
		}
	}
}

// scanSubnet scans a subnet for RTSP cameras
func (eg *EdgeGateway) scanSubnet(ctx context.Context, ipNet *net.IPNet) {
	ip := ipNet.IP.Mask(ipNet.Mask)
	for i := 1; i < 255; i++ {
		select {
		case <-ctx.Done():
			return
		default:
			ip[3] = byte(i)
			targetIP := net.IP(make([]byte, 4))
			copy(targetIP, ip)
			
			go eg.checkRTSPPort(targetIP.String())
		}
	}
}

// checkRTSPPort checks if RTSP is available on the given IP
func (eg *EdgeGateway) checkRTSPPort(ip string) {
	timeout := 2 * time.Second
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:554", ip), timeout)
	if err != nil {
		return
	}
	conn.Close()

	// Try to connect via RTSP
	username := os.Getenv("CAMERA_USERNAME")
	password := os.Getenv("CAMERA_PASSWORD")
	if username == "" {
		username = "root"
	}
	if password == "" {
		password = "pass"
	}

	rtspURL := fmt.Sprintf("rtsp://%s:%s@%s:554/axis-media/media.amp", username, password, ip)
	
	// Quick RTSP test
	client, err := rtsp.DialTimeout(rtspURL, 3*time.Second)
	if err != nil {
		return
	}
	client.Close()

	// Found a camera
	camera := &Camera{
		ID:       fmt.Sprintf("axis-%s", strings.ReplaceAll(ip, ".", "-")),
		Name:     fmt.Sprintf("Camera-%s", ip),
		IP:       ip,
		Port:     554,
		RTSPUrl:  rtspURL,
		Username: username,
		Password: password,
		HasPTZ:   true, // Assume PTZ for now
	}

	eg.camerasLock.Lock()
	eg.cameras[camera.ID] = camera
	eg.camerasLock.Unlock()

	log.Printf("Found camera via network scan: %s", ip)
	eg.notifyCameraStatus(camera, "discovered")
}

// checkPTZSupport checks if camera supports PTZ
func (eg *EdgeGateway) checkPTZSupport(camera *Camera) bool {
	// Try to access PTZ API endpoint
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", fmt.Sprintf("http://%s/axis-cgi/param.cgi?action=list&group=PTZ", camera.IP), nil)
	if err != nil {
		return false
	}
	req.SetBasicAuth(camera.Username, camera.Password)

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// handleWebSocketMessages processes messages from cloud orchestrator
func (eg *EdgeGateway) handleWebSocketMessages(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			eg.wsLock.Lock()
			conn := eg.wsConn
			eg.wsLock.Unlock()

			if conn == nil {
				time.Sleep(time.Second)
				continue
			}

			var msg WSMessage
			err := conn.ReadJSON(&msg)
			if err != nil {
				log.Printf("WebSocket read error: %v", err)
				eg.reconnectToCloud()
				continue
			}

			switch msg.Type {
			case "start_stream":
				var payload struct {
					CameraID string `json:"camera_id"`
				}
				json.Unmarshal(msg.Payload, &payload)
				eg.startStream(payload.CameraID)

			case "stop_stream":
				var payload struct {
					CameraID string `json:"camera_id"`
				}
				json.Unmarshal(msg.Payload, &payload)
				eg.stopStream(payload.CameraID)

			case "webrtc_offer":
				var offer OfferMessage
				json.Unmarshal(msg.Payload, &offer)
				eg.handleWebRTCOffer(offer)

			case "ice_candidate":
				var candidate struct {
					CameraID  string                  `json:"camera_id"`
					Candidate webrtc.ICECandidateInit `json:"candidate"`
				}
				json.Unmarshal(msg.Payload, &candidate)
				eg.handleICECandidate(candidate.CameraID, candidate.Candidate)

			case "ptz_command":
				var cmd PTZCommand
				json.Unmarshal(msg.Payload, &cmd)
				eg.handlePTZCommand(cmd)
			}
		}
	}
}

// startStream starts RTSP to WebRTC conversion for a camera
func (eg *EdgeGateway) startStream(cameraID string) {
	eg.camerasLock.RLock()
	camera, exists := eg.cameras[cameraID]
	eg.camerasLock.RUnlock()

	if !exists {
		log.Printf("Camera not found: %s", cameraID)
		return
	}

	eg.streamsLock.Lock()
	defer eg.streamsLock.Unlock()

	if stream, exists := eg.streams[cameraID]; exists && stream.isRunning {
		log.Printf("Stream already running for camera: %s", cameraID)
		return
	}

	stream := &CameraStream{
		camera:   camera,
		stopChan: make(chan bool),
	}

	eg.streams[cameraID] = stream
	go stream.start()
}

// start begins the RTSP to WebRTC conversion
func (cs *CameraStream) start() {
	cs.runningLock.Lock()
	cs.isRunning = true
	cs.runningLock.Unlock()

	defer func() {
		cs.runningLock.Lock()
		cs.isRunning = false
		cs.runningLock.Unlock()
	}()

	// Connect to RTSP stream
	rtspClient, err := rtsp.DialTimeout(cs.camera.RTSPUrl, 10*time.Second)
	if err != nil {
		log.Printf("Failed to connect to RTSP stream %s: %v", cs.camera.RTSPUrl, err)
		return
	}
	cs.rtspClient = rtspClient
	defer rtspClient.Close()

	// Get stream info
	codecs, err := rtspClient.Streams()
	if err != nil {
		log.Printf("Failed to get stream info: %v", err)
		return
	}

	// Create video track
	cs.videoTrack, err = webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeH264},
		"video", "video0")
	if err != nil {
		log.Printf("Failed to create video track: %v", err)
		return
	}

	log.Printf("Started stream for camera: %s", cs.camera.ID)

	// Read and forward packets
	for {
		select {
		case <-cs.stopChan:
			return
		default:
			packet, err := rtspClient.ReadPacket()
			if err != nil {
				log.Printf("Error reading RTSP packet: %v", err)
				return
			}

			// Process H264 packets
			if packet.IsKeyFrame {
				cs.processVideoPacket(packet)
			}
		}
	}
}

// processVideoPacket processes video packets from RTSP
func (cs *CameraStream) processVideoPacket(packet av.Packet) {
	if cs.videoTrack == nil {
		return
	}

	// Convert to RTP packet format
	sample := media.Sample{
		Data:     packet.Data,
		Duration: time.Duration(packet.Duration),
	}

	if err := cs.videoTrack.WriteSample(sample); err != nil {
		log.Printf("Failed to write video sample: %v", err)
	}
}

// handleWebRTCOffer handles WebRTC offer from cloud
func (eg *EdgeGateway) handleWebRTCOffer(offer OfferMessage) {
	// Create peer connection
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{"stun:stun.l.google.com:19302"},
			},
		},
	}

	peerConnection, err := webrtc.NewPeerConnection(config)
	if err != nil {
		log.Printf("Failed to create peer connection: %v", err)
		return
	}

	// Store peer connection
	eg.peerConnsLock.Lock()
	eg.peerConns[offer.CameraID] = peerConnection
	eg.peerConnsLock.Unlock()

	// Get stream for this camera
	eg.streamsLock.RLock()
	stream, exists := eg.streams[offer.CameraID]
	eg.streamsLock.RUnlock()

	if !exists || stream.videoTrack == nil {
		log.Printf("No stream available for camera: %s", offer.CameraID)
		peerConnection.Close()
		return
	}

	// Add video track to peer connection
	rtpSender, err := peerConnection.AddTrack(stream.videoTrack)
	if err != nil {
		log.Printf("Failed to add video track: %v", err)
		peerConnection.Close()
		return
	}

	// Read incoming RTCP packets
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	// Create data channel for PTZ commands
	if stream.camera.HasPTZ {
		dataChannel, err := peerConnection.CreateDataChannel("ptz", nil)
		if err != nil {
			log.Printf("Failed to create PTZ data channel: %v", err)
		} else {
			dataChannel.OnMessage(func(msg webrtc.DataChannelMessage) {
				var cmd PTZCommand
				if err := json.Unmarshal(msg.Data, &cmd); err == nil {
					cmd.CameraID = offer.CameraID
					eg.handlePTZCommand(cmd)
				}
			})
		}
	}

	// Set up ICE candidate handling
	peerConnection.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate == nil {
			return
		}

		candidateJSON, err := json.Marshal(candidate.ToJSON())
		if err != nil {
			return
		}

		eg.sendToCloud(WSMessage{
			Type: "ice_candidate",
			Payload: json.RawMessage(fmt.Sprintf(`{"camera_id":"%s","candidate":%s}`,
				offer.CameraID, candidateJSON)),
		})
	})

	// Set remote description
	if err := peerConnection.SetRemoteDescription(offer.SDP); err != nil {
		log.Printf("Failed to set remote description: %v", err)
		peerConnection.Close()
		return
	}

	// Create answer
	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		log.Printf("Failed to create answer: %v", err)
		peerConnection.Close()
		return
	}

	// Set local description
	if err := peerConnection.SetLocalDescription(answer); err != nil {
		log.Printf("Failed to set local description: %v", err)
		peerConnection.Close()
		return
	}

	// Send answer to cloud
	answerJSON, _ := json.Marshal(answer)
	eg.sendToCloud(WSMessage{
		Type: "webrtc_answer",
		Payload: json.RawMessage(fmt.Sprintf(`{"camera_id":"%s","sdp":%s}`,
			offer.CameraID, answerJSON)),
	})
}

// handleICECandidate handles ICE candidate from cloud
func (eg *EdgeGateway) handleICECandidate(cameraID string, candidate webrtc.ICECandidateInit) {
	eg.peerConnsLock.RLock()
	pc, exists := eg.peerConns[cameraID]
	eg.peerConnsLock.RUnlock()

	if !exists {
		return
	}

	if err := pc.AddICECandidate(candidate); err != nil {
		log.Printf("Failed to add ICE candidate: %v", err)
	}
}

// handlePTZCommand handles PTZ commands
func (eg *EdgeGateway) handlePTZCommand(cmd PTZCommand) {
	eg.camerasLock.RLock()
	camera, exists := eg.cameras[cmd.CameraID]
	eg.camerasLock.RUnlock()

	if !exists || !camera.HasPTZ {
		log.Printf("Camera not found or doesn't support PTZ: %s", cmd.CameraID)
		return
	}

	// Execute PTZ command via Axis VAPIX API
	var ptzCmd string
	switch cmd.Action {
	case "pan_left":
		ptzCmd = fmt.Sprintf("continuouspantiltmove=-%.2f,0", cmd.Speed)
	case "pan_right":
		ptzCmd = fmt.Sprintf("continuouspantiltmove=%.2f,0", cmd.Speed)
	case "tilt_up":
		ptzCmd = fmt.Sprintf("continuouspantiltmove=0,%.2f", cmd.Speed)
	case "tilt_down":
		ptzCmd = fmt.Sprintf("continuouspantiltmove=0,-%.2f", cmd.Speed)
	case "zoom_in":
		ptzCmd = fmt.Sprintf("continuouszoommove=%.2f", cmd.Speed)
	case "zoom_out":
		ptzCmd = fmt.Sprintf("continuouszoommove=-%.2f", cmd.Speed)
	case "stop":
		ptzCmd = "continuouspantiltmove=0,0&continuouszoommove=0"
	default:
		log.Printf("Unknown PTZ command: %s", cmd.Action)
		return
	}

	// Send PTZ command
	ptzURL := fmt.Sprintf("http://%s/axis-cgi/com/ptz.cgi?%s", camera.IP, ptzCmd)
	req, err := http.NewRequest("GET", ptzURL, nil)
	if err != nil {
		log.Printf("Failed to create PTZ request: %v", err)
		return
	}
	req.SetBasicAuth(camera.Username, camera.Password)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to execute PTZ command: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		log.Printf("PTZ command failed with status: %d", resp.StatusCode)
	}
}

// stopStream stops the stream for a camera
func (eg *EdgeGateway) stopStream(cameraID string) {
	eg.streamsLock.Lock()
	stream, exists := eg.streams[cameraID]
	if exists {
		close(stream.stopChan)
		delete(eg.streams, cameraID)
	}
	eg.streamsLock.Unlock()

	eg.peerConnsLock.Lock()
	if pc, exists := eg.peerConns[cameraID]; exists {
		pc.Close()
		delete(eg.peerConns, cameraID)
	}
	eg.peerConnsLock.Unlock()
}

// notifyCameraStatus sends camera status update to cloud
func (eg *EdgeGateway) notifyCameraStatus(camera *Camera, status string) {
	payload, _ := json.Marshal(map[string]interface{}{
		"camera": camera,
		"status": status,
	})

	eg.sendToCloud(WSMessage{
		Type:    "camera_status",
		Payload: json.RawMessage(payload),
	})
}

// sendToCloud sends a message to cloud orchestrator
func (eg *EdgeGateway) sendToCloud(msg WSMessage) {
	eg.wsLock.Lock()
	defer eg.wsLock.Unlock()

	if eg.wsConn == nil {
		return
	}

	if err := eg.wsConn.WriteJSON(msg); err != nil {
		log.Printf("Failed to send message to cloud: %v", err)
	}
}

// reconnectToCloud attempts to reconnect to cloud orchestrator
func (eg *EdgeGateway) reconnectToCloud() {
	eg.wsLock.Lock()
	if eg.wsConn != nil {
		eg.wsConn.Close()
		eg.wsConn = nil
	}
	eg.wsLock.Unlock()

	for retries := 0; retries < 5; retries++ {
		log.Printf("Attempting to reconnect to cloud (attempt %d/5)", retries+1)
		if err := eg.connectToCloud(); err == nil {
			// Re-send camera list
			eg.camerasLock.RLock()
			for _, camera := range eg.cameras {
				eg.notifyCameraStatus(camera, "reconnected")
			}
			eg.camerasLock.RUnlock()
			return
		}
		time.Sleep(time.Duration(retries+1) * 5 * time.Second)
	}
}

// keepAlive sends periodic ping messages
func (eg *EdgeGateway) keepAlive(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			eg.sendToCloud(WSMessage{
				Type:    "ping",
				Payload: json.RawMessage(`{}`),
			})
		}
	}
}

// cleanup cleans up resources
func (eg *EdgeGateway) cleanup() {
	// Stop all streams
	eg.streamsLock.Lock()
	for cameraID, stream := range eg.streams {
		close(stream.stopChan)
		delete(eg.streams, cameraID)
	}
	eg.streamsLock.Unlock()

	// Close all peer connections
	eg.peerConnsLock.Lock()
	for _, pc := range eg.peerConns {
		pc.Close()
	}
	eg.peerConnsLock.Unlock()

	// Close WebSocket connection
	eg.wsLock.Lock()
	if eg.wsConn != nil {
		eg.wsConn.Close()
	}
	eg.wsLock.Unlock()
}

// getGatewayID returns a unique ID for this gateway
func getGatewayID() string {
	hostname, _ := os.Hostname()
	interfaces, _ := net.Interfaces()
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagLoopback == 0 {
			if mac := iface.HardwareAddr.String(); mac != "" {
				return fmt.Sprintf("%s-%s", hostname, strings.ReplaceAll(mac, ":", ""))
			}
		}
	}
	return hostname
}

func main() {
	cloudURL := os.Getenv("CLOUD_ORCHESTRATOR_URL")
	if cloudURL == "" {
		cloudURL = "wss://orchestrator.example.com/gateway"
	}

	// Ensure WebSocket URL
	if !strings.HasPrefix(cloudURL, "ws://") && !strings.HasPrefix(cloudURL, "wss://") {
		cloudURL = "wss://" + cloudURL
	}

	log.Printf("Edge Gateway starting...")
	log.Printf("Gateway ID: %s", getGatewayID())
	log.Printf("Cloud URL: %s", cloudURL)

	gateway := NewEdgeGateway(cloudURL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Shutting down...")
		cancel()
	}()

	if err := gateway.Start(ctx); err != nil {
		log.Fatalf("Gateway error: %v", err)
	}
}