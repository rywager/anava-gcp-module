import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { NotificationData } from '../types';
import './NotificationManager.css';

const NotificationManager: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Check if notifications are supported
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Show permission prompt after delay if not already granted/denied
      if (Notification.permission === 'default') {
        setTimeout(() => {
          setShowPermissionPrompt(true);
        }, 10000); // Show after 10 seconds
      }
    }

    // Listen for service worker messages (push notifications)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // Add some demo notifications for testing
    const demoNotifications: NotificationData[] = [
      {
        id: '1',
        title: 'Motion Detected',
        body: 'Motion detected at Front Entrance camera',
        timestamp: new Date(Date.now() - 300000), // 5 minutes ago
        cameraId: 'demo-1',
        type: 'motion',
        read: false,
      },
      {
        id: '2',
        title: 'Camera Offline',
        body: 'Server Room camera has gone offline',
        timestamp: new Date(Date.now() - 600000), // 10 minutes ago
        cameraId: 'demo-3',
        type: 'error',
        read: false,
      },
    ];

    setNotifications(demoNotifications);
    setUnreadCount(demoNotifications.filter(n => !n.read).length);

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'NOTIFICATION_RECEIVED') {
      const notificationData: NotificationData = event.data.payload;
      addNotification(notificationData);
    }
  };

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('Notifications not supported in this browser');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setShowPermissionPrompt(false);

      if (result === 'granted') {
        toast.success('Notifications enabled!', { icon: '🔔' });
        
        // Show a test notification
        setTimeout(() => {
          showNotification({
            id: Date.now().toString(),
            title: 'Notifications Active',
            body: 'You\'ll now receive alerts from Anava Vision',
            timestamp: new Date(),
            type: 'system',
            read: false,
          });
        }, 1000);
      } else if (result === 'denied') {
        toast.error('Notifications blocked. Enable them in browser settings.');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to request notification permission');
    }
  };

  const showNotification = (notificationData: NotificationData) => {
    if (permission !== 'granted') return;

    // Create browser notification
    const notification = new Notification(notificationData.title, {
      body: notificationData.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: notificationData.id,
      data: notificationData,
      requireInteraction: true,
    });

    // Handle notification click
    notification.onclick = () => {
      window.focus();
      markAsRead(notificationData.id);
      notification.close();
      
      if (notificationData.cameraId) {
        toast(`Switching to ${notificationData.cameraId}`, { icon: '📹' });
      }
    };

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    // Add to notifications list
    addNotification(notificationData);
  };

  const addNotification = (notification: NotificationData) => {
    setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50
    if (!notification.read) {
      setUnreadCount(prev => prev + 1);
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const clearNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
    toast.success('Notifications cleared');
  };

  const getNotificationIcon = (type: NotificationData['type']) => {
    switch (type) {
      case 'motion':
        return '🏃';
      case 'alert':
        return '🚨';
      case 'error':
        return '❌';
      case 'system':
        return 'ℹ️';
      default:
        return '🔔';
    }
  };

  const getTypeColor = (type: NotificationData['type']) => {
    switch (type) {
      case 'motion':
        return '#f39c12';
      case 'alert':
        return '#e74c3c';
      case 'error':
        return '#e74c3c';
      case 'system':
        return '#3498db';
      default:
        return '#667eea';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (!isSupported) {
    return null;
  }

  return (
    <>
      {/* Permission Prompt */}
      <AnimatePresence>
        {showPermissionPrompt && permission === 'default' && (
          <motion.div
            className="permission-prompt"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
          >
            <div className="permission-content">
              <div className="permission-icon">🔔</div>
              <div className="permission-text">
                <h4>Enable Notifications</h4>
                <p>Get alerts for motion detection and system events</p>
              </div>
              <div className="permission-actions">
                <button onClick={requestPermission} className="enable-button">
                  Enable
                </button>
                <button 
                  onClick={() => setShowPermissionPrompt(false)} 
                  className="dismiss-button"
                >
                  Not Now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Bell */}
      {permission === 'granted' && (
        <motion.div
          className="notification-bell"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.button
            className="bell-button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              // Toggle notifications panel (could implement this)
              toast('Notifications panel would open here', { icon: '🔔' });
            }}
          >
            🔔
            {unreadCount > 0 && (
              <motion.span
                className="notification-badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                key={unreadCount}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </motion.button>
        </motion.div>
      )}

      {/* Demo notification generator for testing */}
      {process.env.NODE_ENV === 'development' && permission === 'granted' && (
        <motion.button
          className="demo-notification-button"
          onClick={() => {
            const demoNotification: NotificationData = {
              id: Date.now().toString(),
              title: 'Test Notification',
              body: `Motion detected at ${new Date().toLocaleTimeString()}`,
              timestamp: new Date(),
              cameraId: 'demo-1',
              type: 'motion',
              read: false,
            };
            showNotification(demoNotification);
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Test Notification
        </motion.button>
      )}
    </>
  );
};

export default NotificationManager;