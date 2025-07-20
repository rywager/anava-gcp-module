const { ipcMain } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AcapDownloaderService {
  constructor() {
    this.setupIPC();
    this.downloadDir = path.join(os.tmpdir(), 'anava-acaps');
    this.ensureDownloadDir();
  }

  setupIPC() {
    ipcMain.handle('get-latest-acaps', async (event) => {
      return this.getLatestAcaps();
    });

    ipcMain.handle('download-acap', async (event, downloadUrl, fileName) => {
      return this.downloadAcap(downloadUrl, fileName);
    });

    ipcMain.handle('get-downloaded-acaps', async (event) => {
      return this.getDownloadedAcaps();
    });
  }

  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  async getLatestAcaps() {
    try {
      console.log('Fetching latest ACAP releases from GitHub...');
      
      const response = await axios.get('https://api.github.com/repos/AnavaAcap/acap-releases/releases/latest', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Anava-Desktop-App/1.0.0'
        }
      });

      const release = response.data;
      
      if (!release || !release.assets || release.assets.length === 0) {
        throw new Error('No assets found in latest release');
      }

      const acapAssets = release.assets.filter(asset => 
        asset.name.endsWith('.eap') || asset.name.endsWith('.acap')
      );

      if (acapAssets.length === 0) {
        throw new Error('No ACAP files found in latest release');
      }

      const acapFiles = acapAssets.map(asset => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
        createdAt: asset.created_at,
        architecture: this.detectArchitecture(asset.name),
        isDownloaded: this.isFileDownloaded(asset.name)
      }));

      console.log(`Found ${acapFiles.length} ACAP files in release ${release.tag_name}`);
      
      return {
        version: release.tag_name,
        releaseDate: release.published_at,
        description: release.body || 'Latest ACAP release',
        acapFiles: acapFiles
      };

    } catch (error) {
      console.error('Error fetching ACAP releases:', error);
      throw new Error(`Failed to fetch ACAP releases: ${error.message}`);
    }
  }

  async downloadAcap(downloadUrl, fileName) {
    try {
      console.log(`Downloading ACAP file: ${fileName}`);
      
      const filePath = path.join(this.downloadDir, fileName);
      
      // Check if file already exists
      if (fs.existsSync(filePath)) {
        console.log(`File ${fileName} already exists`);
        return {
          success: true,
          filePath: filePath,
          message: 'File already downloaded'
        };
      }

      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Anava-Desktop-App/1.0.0'
        }
      });

      const writer = fs.createWriteStream(filePath);
      
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Successfully downloaded ${fileName}`);
          resolve({
            success: true,
            filePath: filePath,
            message: 'Download completed'
          });
        });

        writer.on('error', (error) => {
          console.error(`Error downloading ${fileName}:`, error);
          reject(new Error(`Download failed: ${error.message}`));
        });
      });

    } catch (error) {
      console.error(`Error downloading ACAP file ${fileName}:`, error);
      throw new Error(`Failed to download ${fileName}: ${error.message}`);
    }
  }

  async getDownloadedAcaps() {
    try {
      this.ensureDownloadDir();
      
      const files = fs.readdirSync(this.downloadDir)
        .filter(file => file.endsWith('.eap') || file.endsWith('.acap'))
        .map(file => {
          const filePath = path.join(this.downloadDir, file);
          const stats = fs.statSync(filePath);
          
          return {
            name: file,
            filePath: filePath,
            size: stats.size,
            downloadedAt: stats.mtime,
            architecture: this.detectArchitecture(file)
          };
        });

      return files;
    } catch (error) {
      console.error('Error getting downloaded ACAPs:', error);
      return [];
    }
  }

  detectArchitecture(fileName) {
    const name = fileName.toLowerCase();
    
    if (name.includes('aarch64') || name.includes('arm64')) {
      return 'aarch64';
    } else if (name.includes('armv7hf') || name.includes('armv7')) {
      return 'armv7hf';
    } else if (name.includes('x86_64') || name.includes('x64')) {
      return 'x86_64';
    } else if (name.includes('i386') || name.includes('x86')) {
      return 'i386';
    }
    
    return 'unknown';
  }

  isFileDownloaded(fileName) {
    const filePath = path.join(this.downloadDir, fileName);
    return fs.existsSync(filePath);
  }

  getDownloadDirectory() {
    return this.downloadDir;
  }
}

module.exports = AcapDownloaderService;