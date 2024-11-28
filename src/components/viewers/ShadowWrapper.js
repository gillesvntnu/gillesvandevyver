import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

const ShadowWrapper = ({ children }) => {
    const shadowHostRef = useRef(null);
    const shadowRootRef = useRef(null);
    const [shadowRoot, setShadowRoot] = useState(null); // State to track when shadowRoot is ready

    useEffect(() => {
        if (shadowHostRef.current && !shadowRootRef.current) {
            const root = shadowHostRef.current.attachShadow({ mode: 'open' });
            shadowRootRef.current = root;
            setShadowRoot(root); // Trigger re-render once shadowRoot is ready
        }
    }, []);

    if (!shadowRoot) {
        // Don't render children until the shadow root is ready
        return <div ref={shadowHostRef} />;
    }

    return (
        <div ref={shadowHostRef}>
            {ReactDOM.createPortal(children, shadowRoot)}
        </div>
    );
};

export default ShadowWrapper;
