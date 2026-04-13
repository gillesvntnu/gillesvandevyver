import React, { useRef, useState, useEffect } from 'react';
import './VideoPlayer.css';

/**
 * A professional, minimal video player for project demos.
 * - Autoplays on load
 * - Muted (required for autoplay in modern browsers)
 * - Loops continuously
 * - Plays inline on mobile
 * - Minimal controls: fullscreen toggle only
 */
const VideoPlayer = ({ src, type = 'video/mp4', maxWidth = 900, ariaLabel = 'Project demo video' }) => {
    const videoRef = useRef(null);
    const frameRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const fsElement =
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement;
            setIsFullscreen(!!fsElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const toggleFullscreen = () => {
        const fsElement =
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        if (!fsElement) {
            const el = frameRef.current;
            const video = videoRef.current;
            // Prefer frame fullscreen for consistent styling; fall back to video element (iOS Safari).
            if (el && el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el && el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            } else if (el && el.mozRequestFullScreen) {
                el.mozRequestFullScreen();
            } else if (el && el.msRequestFullscreen) {
                el.msRequestFullscreen();
            } else if (video && video.webkitEnterFullscreen) {
                // iOS Safari
                video.webkitEnterFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    };

    return (
        <div className="pro-video-wrapper" style={{ maxWidth: `${maxWidth}px` }}>
            <div className="pro-video-frame" ref={frameRef}>
                <video
                    ref={videoRef}
                    className="pro-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    disablePictureInPicture
                    disableRemotePlayback
                    controlsList="nodownload noplaybackrate noremoteplayback"
                    preload="auto"
                    aria-label={ariaLabel}
                >
                    <source src={src} type={type} />
                    Your browser does not support the video tag.
                </video>
                <button
                    type="button"
                    className="pro-video-fullscreen-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                    {isFullscreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 8V5a2 2 0 0 1 2-2h3" />
                            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                            <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default VideoPlayer;
