import React from 'react';
import './CommonStyles.css';
import VideoPlayer from '../../viewers/VideoPlayer';
import demoVideo from '../../../vidoes/ImprovingClinicalMeasurements/auto_tdi_example.mp4';
import strain_pic from '../../../images/ImprovingClinicalMeasurements/strain.png';


function ImprovingClinicalMeasurements() {
    return (
        <div className="project-page-container">
            <h1>Improving clinical measurements</h1>
            <div className="horizontal-card horizontal-card-right">
                <div style={{gridColumn: '1 / -1', display: 'flex', justifyContent: 'center'}}>
                    <VideoPlayer src={demoVideo} type="video/mp4"
                                 ariaLabel="Automatic regional strain and velocity extraction from TDI"/>
                </div>
                <div className="section-title">
                    <h2><br/><br/>Automatic regional strain from tissue doppler imaging </h2>
                </div>
                <div className="media-section">
                    <img src={strain_pic} alt="Regional strain extraction"/>
                </div>
                <div className="section-body">
                    <p>

                        Regional strain and velocity measurements provide clinicians with detailed insight
                        into how different parts of the heart muscle contract and move,
                        often revealing disease before ejection fraction drops. In current clinical software,
                        regional tissue doppler imaging (TDI) measurements are obtained by placing a fixed 
                        sample volume in the myocardium that stays stationary throughout the cardiac cycle.
                    </p>
                    <p>
                        In this project, I developed a fully automatic pipeline that extracts regional strain and velocity curves
                        from TDI recordings without any manual intervention. The tool uses deep learning to segment the
                        myocardium in the TDI recording and tracks the movement of each segment over time.
                        This improves the quality of the measurements, removes the need for manual placement,
                        and makes measurements reproducible.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default ImprovingClinicalMeasurements;
