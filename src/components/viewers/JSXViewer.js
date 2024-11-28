import React, { useState, useEffect } from 'react';
import SvgIcon1 from '../../other/SvgIcon1';
import SvgIcon2 from '../../other/SvgIcon2';
import ShadowWrapper from './ShadowWrapper';
import './SvgViewer.css'; // Import the CSS file

const SvgViewer = () => {
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 768);

    const handleResize = () => {
        setIsSmallScreen(window.innerWidth <= 768);
    };

    useEffect(() => {
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    if (isSmallScreen) {
        return (
            <div className="svg-link">
                <a href="https://www.dropbox.com/s/m80bv1ss8qk1uch/Recommendation%20letter%20Gilles%20Van%20de%20Vyver%20%28Sam%20Michiels%2C%20April%202022%29.pdf?dl=0" target="_blank" rel="noopener noreferrer">
                    View Recommendation Letter
                </a>
            </div>
        );
    }

    return (
        <div className="svg-viewer">
            <div className="svg-container">
                <div className="svg-item">
                    <ShadowWrapper>
                        <SvgIcon1 />
                    </ShadowWrapper>
                </div>
            </div>
            <div className="svg-container">
                <div className="svg-item">
                    <ShadowWrapper>
                        <SvgIcon2 />
                    </ShadowWrapper>
                </div>
            </div>
        </div>
    );
};

export default SvgViewer;