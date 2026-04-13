import React from 'react';
import './CommonStyles.css';
import VideoPlayer from '../../viewers/VideoPlayer';
import demoVideo from '../../../videos/RobustComputerVision/Agreement_demo.mp4';
import agrrement_pic1 from '../../../images/finding_hearts/agreement_pic1.png';
import agrrement_pic2 from '../../../images/finding_hearts/agreement_pic2.png';
import agrrement_pic3 from '../../../images/finding_hearts/agreement_pic3.png';
import agrrement_pic5 from '../../../images/finding_hearts/agreement_pic5.png';


const RobustComputerVision = () => {
    return (
        <div className="project-page-container">
            <h1>Robust Computer Vision for Echo</h1>
            <div className="horizontal-card horizontal-card-right">

                <div style={{gridColumn: '1 / -1', display: 'flex', justifyContent: 'center'}}>
                    <VideoPlayer src={demoVideo} type="video/mp4" ariaLabel="Robust computer vision demo" />
                </div>
                <div className="section-title">
                    <h2> <br/><br/> Detecting when neural networks disagree on cardiac segmentation</h2>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic2} alt=""/>
                    </a>
                    <p>Automatic segmentation of the left ventricle.</p>
                </div>
                <div className="section-body">
                    <p>
                        Echocardiography is the standard imaging modality for assessing cardiac health,
                        enabling clinicians to derive clinical measurements like ejection fraction.
                        In practice, a cardiologist must manually trace the heart's contours in ultrasound images
                        to obtain these measurements, a time-consuming process typically performed on only a single heartbeat.
                    </p>
                </div>
                <div className="section-title">
                    <h3>Automating segmentation with AI</h3>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic3} alt=""/>
                    </a>
                    <p>A failing case: poor image quality leads to an anatomically implausible segmentation.</p>
                </div>
                <div className="section-body">
                    <p>
                        Deep learning models can automatically segment the left ventricle,
                        removing the need for manual contouring. This not only saves time
                        but also enables measurement across multiple cardiac cycles,
                        producing reproducible results.
                    </p>
                    <p>
                        In clinical settings, reliability is critical. Segmentation models can fail
                        when faced with poor image quality or unusual cardiac anatomy.
                        In these cases, the model tends to produce anatomically implausible shapes
                        that would lead to incorrect measurements.
                    </p>
                </div>

                <div className="section-title">
                    <h3>Disagreement as a failure signal</h3>
                    <p>
                        I developed a second segmentation network based on graph convolutional networks,
                        designed to produce anatomically valid contours by design.
                        By running both models on the same input and comparing their outputs,
                        disagreement between the two serves as a reliable indicator of failure.
                    </p>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic1} alt=""/>
                    </a>
                </div>
                <div className="text-section">
                    <h3>Code and publication</h3>
                    <p>
                        The code is available as a Python library
                        at <a href="https://github.com/GillesVanDeVyver/GCN_multistructure">GitHub</a>.
                        The work is published in IEEE Access: <a href="https://ieeexplore.ieee.org/document/10458930">
                        Toward Robust Cardiac Segmentation Using Graph Convolutional Networks</a>,
                        and was presented as a lecture at the 2023 IEEE International Ultrasonics Symposium.
                    </p>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic5} alt=""/>
                    </a>
                    <p>An anatomically constrained network produces valid contours by design.</p>
                </div>
                <div className="section-body">

                </div>

            </div>
        </div>
    );
}

export default RobustComputerVision;
