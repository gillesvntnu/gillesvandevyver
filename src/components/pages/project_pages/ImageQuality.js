import React from 'react';
import './CommonStyles.css';
import VideoPlayer from '../../viewers/VideoPlayer';
import demoVideo from '../../../vidoes/ImageQuality/regional_quality_demo.mp4';
import quality_pic1 from '../../../images/finding_hearts/quality_pic1.png';
import quality_pic2 from '../../../images/finding_hearts/quality_pic2.png';
import quality_pic3 from '../../../images/finding_hearts/quality_pic3.png';
import quality_pic4 from '../../../images/finding_hearts/quality_pic4.png';
import quality_pic5 from '../../../images/finding_hearts/quality_pic5.jpg';


function ImageQuality() {
    return (
        <div className="project-page-container">
            <h1>Image Quality</h1>
            <div className="horizontal-card horizontal-card-right">
                <div style={{gridColumn: '1 / -1', display: 'flex', justifyContent: 'center'}}>
                    <VideoPlayer src={demoVideo} type="video/mp4" ariaLabel="Regional image quality demo" />
                </div>
                <div className="section-title">
                    <h2><br/><br/>Does your heart look good?</h2>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic1} alt=""/>
                    </a>
                </div>
                <div className="section-body">
                    <p>

                        In this work, I created a tool that automatically tells the quality
                        of a cardiac echo image in real-time.
                        Three senior clinicians came together to discuss how they define a good cardiac echo image.
                        Then, they put image quality labels on 458 echo images from 65 different study participants.
                        With this data, I trained a neural network to mimic the clinicians.
                        After extensive tuning and testing, I ended up with a model that can label the image
                        quality of cardiac images in real-time with fewer mistakes than the clinicians among themselves.
                    </p>
                </div>
                <div className="section-title">
                    <h3>Code, publication, and award </h3>
                </div>
                <div className="section-body">
                    <p> 
                    My code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/arqee">
                            https://github.com/GillesVanDeVyver/arqee</a>.
                        I provide comprehensive tutorials and examples on how to use the code.
                        </p>
                        <p> 
                        The work is published on Ultrasound in Medicine & Biology (UMB):&nbsp;
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        Regional Image Quality Scoring for 2-D Echocardiography Using Deep Learning
                    </a>. The article is on the cover page of the issue: &nbsp;
                    <a href="https://www.sciencedirect.com/journal/ultrasound-in-medicine-and-biology/vol/51/issue/4">
                        UMB Volume 51 Issue 4
                    </a>.<br/><br/>
                    It was presented at the 2024 IUS (IEEE International Ultrasonics Symposium) conference as a lecture. <br/><br/>
                    Additionally, the work was presented at the MICCAI (Medical Image Computing and Computer Assisted Intervention) 2024
                    conference, where it was awarded the runner-up prize for best poster
                    in the ASMUS (Advances in Simplifying Medical Ultrasound) workshop.
                    </p>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic2} alt=""/>
                    </a>
                    <p> These two echoes where obtained using the same scanner, yet the quality is vastly
                        different.</p>
                </div>

                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic3} alt=""/>
                    </a>
                    <p> The AI labels the image quality of each region of the heart wall.</p>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/journal/ultrasound-in-medicine-and-biology/vol/51/issue/4"
                       target="_blank" rel="noopener noreferrer">
                        <img src={quality_pic5} alt="" className="small-image"/>
                    </a>
                    <p> The article is on the cover page of its issue.</p>
                </div>

                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic4} alt=""/>
                    </a>
                    <p> The poster presentation was awarded the runner-up prize for best poster in the ASMUS
                        workshop at MICCAI 2024.</p>
                </div>
            </div>
        </div>
    );
}

export default ImageQuality;
