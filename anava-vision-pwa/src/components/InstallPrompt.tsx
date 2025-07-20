import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { InstallPromptEvent } from '../types';
import './InstallPrompt.css';

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      const installEvent = e as InstallPromptEvent;
      setDeferredPrompt(installEvent);
      setIsInstallable(true);
      
      // Show install prompt after a delay
      setTimeout(() => {
        setShowPrompt(true);
      }, 5000); // Show after 5 seconds
    };

    // Listen for app install
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsInstallable(false);
      setShowPrompt(false);
      toast.success('App installed successfully!', {
        icon: '🎉',
        duration: 5000,
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    setShowPrompt(false);

    try {
      // Show the install prompt
      await deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        toast.success('Installing app...', { icon: '⏳' });
      } else {
        toast('Installation cancelled', { icon: '❌' });
      }
      
      // Clear the saved prompt since it's been used
      setDeferredPrompt(null);
      setIsInstallable(false);
    } catch (error) {
      console.error('Installation failed:', error);
      toast.error('Installation failed. Please try again.');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    toast('You can install the app later from the browser menu', {
      icon: 'ℹ️',
      duration: 4000,
    });
  };

  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  };

  const showIOSInstructions = () => {
    toast((t) => (
      <div className="ios-install-toast">
        <h4>Install App on iOS</h4>
        <ol>
          <li>Tap the Share button <span>📤</span></li>
          <li>Scroll down and tap "Add to Home Screen" <span>📱</span></li>
          <li>Tap "Add" to install</li>
        </ol>
        <button onClick={() => toast.dismiss(t.id)}>Got it!</button>
      </div>
    ), {
      duration: 10000,
      style: { maxWidth: '350px' },
    });
  };

  // Don't show anything if app is already installed
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* Install Prompt Modal */}
      <AnimatePresence>
        {showPrompt && deferredPrompt && (
          <motion.div
            className="install-prompt-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
          >
            <motion.div
              className="install-prompt"
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="install-prompt-header">
                <div className="app-icon">📹</div>
                <div className="app-info">
                  <h3>Install Anava Vision</h3>
                  <p>Get the full app experience</p>
                </div>
                <button className="close-button" onClick={handleDismiss}>
                  ✕
                </button>
              </div>

              <div className="install-prompt-content">
                <div className="features-list">
                  <div className="feature">
                    <span className="feature-icon">🚀</span>
                    <span className="feature-text">Fast and reliable</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">📱</span>
                    <span className="feature-text">Works offline</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🔔</span>
                    <span className="feature-text">Push notifications</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🏠</span>
                    <span className="feature-text">Home screen access</span>
                  </div>
                </div>
              </div>

              <div className="install-prompt-actions">
                <button
                  className="install-button"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <>
                      <span className="spinner"></span>
                      Installing...
                    </>
                  ) : (
                    <>
                      <span>📲</span>
                      Install App
                    </>
                  )}
                </button>
                <button className="later-button" onClick={handleDismiss}>
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Install Button (if not installable via prompt) */}
      {isIOS() && !isInstallable && !isInstalled && (
        <motion.button
          className="ios-install-button"
          onClick={showIOSInstructions}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span>📱</span>
          Install App
        </motion.button>
      )}

      {/* Floating Install Button */}
      {isInstallable && !showPrompt && (
        <motion.button
          className="floating-install-button"
          onClick={() => setShowPrompt(true)}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="install-icon">📲</span>
          <span className="install-text">Install</span>
        </motion.button>
      )}
    </>
  );
};

export default InstallPrompt;