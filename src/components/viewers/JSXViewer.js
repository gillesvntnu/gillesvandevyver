import React from 'react';
import SvgIcon1 from '../../other/SvgIcon1';
import SvgIcon2 from '../../other/SvgIcon2';
import ShadowWrapper from './ShadowWrapper';

const SvgViewer = () => {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', backgroundColor: 'white' }}>
                <div style={{ margin: 'auto' }}>
                    <ShadowWrapper>
                        <SvgIcon1 />
                    </ShadowWrapper>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', backgroundColor: 'white' }}>
                <div style={{ margin: 'auto' }}>
                    <ShadowWrapper>
                        <SvgIcon2 />
                    </ShadowWrapper>
                </div>
            </div>
        </div>
    );
};

export default SvgViewer;