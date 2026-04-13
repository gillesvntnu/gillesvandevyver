import React from 'react';
import './CommonStyles.css';
import VideoPlayer from '../../viewers/VideoPlayer';
import demoVideo from '../../../vidoes/ImprovingClinicalMeasurements/auto_tdi_example.mp4';
import strainPic from '../../../images/ImprovingClinicalMeasurements/strain.png';


const ImprovingClinicalMeasurements = () => {
    return (
        <div className="project-page-container">
            <h1>Improving Clinical Measurements</h1>
            <div className="horizontal-card horizontal-card-right">

                <div style={{gridColumn: '1 / -1', display: 'flex', justifyContent: 'center'}}>
                    <VideoPlayer src={demoVideo} type="video/mp4" ariaLabel="Automated strain from tissue Doppler imaging demo" />
                </div>

                <div className="section-title">
                    <h2><br/><br/>Automating strain measurements from tissue Doppler imaging</h2>
                </div>
                <div className="media-section">
                    <img src={strainPic} alt="Myocardial strain curves"/>
                    <p>Regional myocardial strain curves derived automatically from a TDI recording.</p>
                </div>
                <div className="section-body">
                    <p>
                        Myocardial strain is one of the most sensitive markers of cardiac function,
                        often revealing disease long before ejection fraction drops. In clinical practice,
                        however, obtaining strain values from tissue Doppler imaging (TDI) is tedious:
                        a cardiologist has to manually place and track tissue samples in the myocardium,
                        frame by frame, which is time-consuming and prone to inter-observer variability.
                    </p>
                </div>

                <div className="section-title">
                    <h3>An automated pipeline for TDI strain</h3>
                </div>
                <div className="section-body">
                    <p>
                        In this project, I built a pipeline that takes a raw TDI loop as input and
                        returns regional strain curves without any manual interaction. The tool
                        automatically detects the myocardium, tracks it throughout the cardiac cycle,
                        extracts tissue velocities from the Doppler signal, and integrates them into
                        strain and strain-rate traces for each myocardial segment.
                    </p>
                    <p>
                        By combining deep-learning-based segmentation with classical signal processing
                        on the Doppler data, the pipeline produces reproducible measurements across
                        multiple heartbeats, rather than the single beat typically analyzed by hand.
                    </p>
                </div>

                <div className="section-title">
                    <h3>Why it matters clinically</h3>
                </div>
                <div className="section-body">
                    <p>
                        Automating the measurement removes a major source of variability between
                        operators and between exams, making strain a more trustworthy parameter for
                        follow-up and for multi-center studies. It also frees clinicians from the
                        repetitive work of placing tracking points, so they can focus on interpreting
                        the curves rather than producing them.
                    </p>
                </div>

                <div className="text-section">
                    <h3>Code</h3>
                    <p>
                        The code for this project is available
                        at <a href="https://github.com/GillesVanDeVyver/autoStrainTDI">
                        github.com/GillesVanDeVyver/autoStrainTDI</a>.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default ImprovingClinicalMeasurements;
