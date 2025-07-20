import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip
} from '@mui/material';
import {
  Download as DownloadIcon,
  CloudDownload as CloudDownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Architecture as ArchitectureIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

interface AcapFile {
  name: string;
  downloadUrl: string;
  size: number;
  createdAt: string;
  architecture: string;
  isDownloaded: boolean;
  filePath?: string;
}

interface AcapRelease {
  version: string;
  releaseDate: string;
  description: string;
  acapFiles: AcapFile[];
}

const AcapManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestRelease, setLatestRelease] = useState<AcapRelease | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<AcapFile[]>([]);
  const [downloadDialog, setDownloadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AcapFile | null>(null);

  useEffect(() => {
    loadLatestRelease();
    loadDownloadedFiles();
  }, []);

  const loadLatestRelease = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const release = await window.electronAPI.getLatestAcaps();
      setLatestRelease(release);
    } catch (err: any) {
      setError(`Failed to load latest ACAP release: ${err.message}`);
      console.error('Error loading latest release:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDownloadedFiles = async () => {
    try {
      const files = await window.electronAPI.getDownloadedAcaps();
      setDownloadedFiles(files);
    } catch (err: any) {
      console.error('Error loading downloaded files:', err);
    }
  };

  const downloadAcap = async (file: AcapFile) => {
    try {
      setDownloading(file.name);
      setError(null);
      
      const result = await window.electronAPI.downloadAcap(file.downloadUrl, file.name);
      
      if (result.success) {
        // Refresh the data
        await loadLatestRelease();
        await loadDownloadedFiles();
        setDownloadDialog(false);
        setSelectedFile(null);
      } else {
        setError(`Failed to download ${file.name}`);
      }
    } catch (err: any) {
      setError(`Failed to download ${file.name}: ${err.message}`);
      console.error('Download error:', err);
    } finally {
      setDownloading(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getArchitectureColor = (arch: string) => {
    switch (arch) {
      case 'aarch64': return 'primary';
      case 'armv7hf': return 'secondary';
      case 'x86_64': return 'success';
      case 'i386': return 'warning';
      default: return 'default';
    }
  };

  const openDownloadDialog = (file: AcapFile) => {
    setSelectedFile(file);
    setDownloadDialog(true);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          ACAP Manager
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadLatestRelease();
            loadDownloadedFiles();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Latest Release Info */}
      {latestRelease && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Latest Release: {latestRelease.version}
              </Typography>
              <Chip 
                label={formatDate(latestRelease.releaseDate)}
                color="primary"
                variant="outlined"
              />
            </Box>
            <Typography variant="body2" color="textSecondary" paragraph>
              {latestRelease.description}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                Available Files
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {latestRelease?.acapFiles.length || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="success.main">
                Downloaded
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {downloadedFiles.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="warning.main">
                Pending
              </Typography>
              <Typography variant="h3" fontWeight="bold">
                {latestRelease?.acapFiles.filter(f => !f.isDownloaded).length || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ACAP Files Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Available ACAP Files
          </Typography>
          
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : !latestRelease || latestRelease.acapFiles.length === 0 ? (
            <Box textAlign="center" p={4}>
              <Typography variant="body1" color="textSecondary">
                No ACAP files available. Click "Refresh" to check for updates.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>File Name</TableCell>
                    <TableCell>Architecture</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {latestRelease.acapFiles.map((file) => (
                    <TableRow key={file.name}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <ArchitectureIcon sx={{ mr: 1, color: 'primary.main' }} />
                          {file.name}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={file.architecture}
                          color={getArchitectureColor(file.architecture) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatFileSize(file.size)}</TableCell>
                      <TableCell>
                        {file.isDownloaded ? (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="Downloaded"
                            color="success"
                            size="small"
                          />
                        ) : (
                          <Chip
                            icon={<CloudDownloadIcon />}
                            label="Available"
                            color="default"
                            size="small"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {file.isDownloaded ? (
                          <Tooltip title="Already downloaded">
                            <IconButton disabled>
                              <CheckCircleIcon color="success" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Download ACAP file">
                            <IconButton
                              onClick={() => openDownloadDialog(file)}
                              disabled={downloading === file.name}
                            >
                              {downloading === file.name ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DownloadIcon />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Download Dialog */}
      <Dialog open={downloadDialog} onClose={() => setDownloadDialog(false)}>
        <DialogTitle>Download ACAP File</DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to download this ACAP file?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2"><strong>File:</strong> {selectedFile.name}</Typography>
                <Typography variant="body2"><strong>Architecture:</strong> {selectedFile.architecture}</Typography>
                <Typography variant="body2"><strong>Size:</strong> {formatFileSize(selectedFile.size)}</Typography>
              </Box>
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  The file will be downloaded to your system's temporary directory and can be used for ACAP deployment.
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialog(false)}>Cancel</Button>
          <Button 
            onClick={() => selectedFile && downloadAcap(selectedFile)} 
            variant="contained"
            disabled={downloading !== null}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AcapManager;