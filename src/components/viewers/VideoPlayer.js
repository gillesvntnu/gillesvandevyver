import React from 'react';
import './VideoPlayer.css';

/**
 * A professional, minimal video player for project demos.
 * - Autoplays on load
 * - Muted (required for autoplay in modern browsers)
 * - Loops continuously
 * - Plays inline on mobile
 * - No user controls (no pause, speed, fullscreen options)
 */
const VideoPlayer = ({ src, type = 'video/mp4', maxWidth = 900, ariaLabel = 'Project demo video' }) => {
    return (
        <div className="pro-video-wrapper" style={{ maxWidth: `${maxWidth}px` }}>
            <div className="pro-video-frame">
                <video
                    className="pro-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    disablePictureInPicture
                    disableRemotePlayback
                    controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
                    preload="auto"
                    aria-label={ariaLabel}
                >
                    <source src={src} type={type} />
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
};

export default VideoPlayer;
