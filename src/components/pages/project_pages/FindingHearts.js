import React from 'react';
import './CommonStyles.css';
import agrrement_pic1 from '../../../images/finding_hearts/agreement_pic1.png';
import agrrement_pic2 from '../../../images/finding_hearts/agreement_pic2.png';
import agrrement_pic3 from '../../../images/finding_hearts/agreement_pic3.png';
import agrrement_pic5 from '../../../images/finding_hearts/agreement_pic5.png';

import quality_pic1 from '../../../images/finding_hearts/quality_pic1.png';
import quality_pic2 from '../../../images/finding_hearts/quality_pic2.png';
import quality_pic3 from '../../../images/finding_hearts/quality_pic3.png';
import quality_pic4 from '../../../images/finding_hearts/quality_pic4.png';
import quality_pic5 from '../../../images/finding_hearts/quality_pic5.jpg';


function RobustVisionEcho() {
    return (
        <div className="project-page-container">
            <h1> Robust computer vision for Echo</h1>
            <div className="horizontal-card horizontal-card-left">
                <div className="section-title">
                    <h2>When different neural networks disagree where the ❤️ is, something is wrong</h2>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic1} alt=""/>
                    </a>
                    <p>The disagreement of two independent networks is an indication of failure.</p>
                </div>
                <div className="section-body">
                    <p>
                        One in three deaths in the United States is caused by cardiovascular diseases.
                        That's 702,880 per year, or 1 every 45 seconds, in the US alone.
                        Ultrasound imaging is the standard way to assess cardiac health.
                        These imaging techniques allow us to determine important clinical parameters,
                        for example, how much blood the heart is pumping (the 'ejection fraction').
                        In the clinic today, the doctor must draw exactly where the heart is in the ultrasound
                        images to get these measurements right. This takes a lot of time,
                        and the doctor usually only bothers to do this for a single heartbeat.
                    </p>
                </div>
                <div className="section-title">
                    <h3> How can AI help us? </h3>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic2} alt=""/>
                    </a>
                    <p> Automatic segmentation of the heart</p>
                </div>
                <div className="section-body">
                    <p>
                        By having an AI to automatically draw the contours of the heart ('segmentation'),
                        we can automate the measurements.
                        This way, we not only save time but also are
                        more robust because we can measure multiple heartbeats and get the exact same
                        answer every time for a given image.
                    </p>
                </div>
                <div className="section-title">
                    <h3> So, what's the problem?</h3>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic3} alt=""/>
                    </a>
                    <p> Failing case for the AI. In this case the bad image quality is to blame.
                        The result is a weird shape that does not make sense.</p>
                </div>
                <div className="section-body">
                    <p>
                        Because we are in the medical sector, we want the AI to be reliable.
                        It should work for every patient. One difficulty can be that ultrasound images can have
                        bad image quality.
                        Another difficulty is that each heart is different.
                        The AI might work well for healthy hearts, but it might fail when the heart has
                        unusual characteristics because the model is not used to these cases.
                        We see that when the model fails, it tends to produce weird shapes that
                        don't make any anatomical sense.
                    </p>
                </div>
                <div className="section-title">
                    <h3> How to solve this problem? </h3>
                </div>
                <div className="media-section">
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        <img src={agrrement_pic5} alt=""/>
                    </a>
                    <p> AI designed to create an anatomically valid contour.</p>
                </div>
                <div className="section-body">
                    <p>
                        I made an AI designed specifically to avoid weird shapes and anatomical errors
                        by teaching it to create a contour inspired by human anatomy.
                        While this new AI is not perfect, it does not produce weird shapes.
                        However, we can now use it in an intelligent way. When we have a new ultrasound image,
                        we can run both AIs on it and see whether they agree.
                        If they disagree on where the heart is, we see that either the input image is not a
                        correct image of the heart, or the AI made a mistake.
                        Now we can use this information to warn the user when the AI made a mistake.
                        We can also use it to find specific cases the segmentation fails on, and then annotate
                        those cases to retrain the AI so that it will not fail the next time it sees a similar
                        case ('active learning').
                    </p>
                </div>
                <div className="text-section">
                    <h3> Open-source code and demo</h3>
                    <p>
                        My code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/GCN_multistructure">
                        https://github.com/GillesVanDeVyver/GCN_multistructure</a>.
                        <br/>
                        I also made a demo video to show our proof of concept in real-time on the
                        scanner:&nbsp;
                        <a href="https://youtu.be/I9R8kxwj0fw">
                            Demo on YouTube</a>,
                    </p>
                    <h3> Publication and presentation </h3>
                    <p>
                    The work is published in IEEE access: {'\n'}
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        Toward Robust Cardiac Segmentation Using Graph Convolutional Networks
                    </a>. <br/><br/>
                    It was also presented at the 2023 IUS (IEEE International Ultrasonics Symposium) conference as a lecture.<br/><br/>
                    </p>
                </div>
            </div>
            <div className="horizontal-card horizontal-card-right">
                <div className="section-title">
                    <h2>Does your heart look good?</h2>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic1} alt=""/>
                    </a>
                </div>
                <div className="section-body">
                    <p>
                        Ultrasound imaging is amazing.
                        You take your ultrasound probe, put some gel on it, place it on your chest, and voila,
                        there you and your doctor can see your heart pumping.
                        But what do you see? For some patients, the images obtained during an echo have great
                        detail and the doctor can make accurate measurements of clinical measurements, while for
                        others the doctor can barely distinguish the contour of your heart.
                        In this work, I created a tool that automatically tells you how good or bad the quality
                        of the heart is, in real-time.
                    </p>
                </div>
                <div className="section-title">
                    <h3> How does it work? </h3>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic2} alt=""/>
                    </a>
                    <p> These two echoes where obtained using the same scanner, yet the quality is vastly
                        different.</p>
                </div>
                <div className="section-body">
                    <p>
                        Three senior clinicians came together to discuss how they define a good cardiac echo image.
                        Then, they put image quality labels on 458 echo images from 65 different study participants.
                        With this data, I trained a neural network to mimic the clinicians.
                        After extensive tuning and testing, I ended up with a model that can label the image
                        quality of cardiac images in real-time with fewer mistakes than the clinicians among themselves.
                    </p>
                </div>
                <div className="section-title">
                    <h3> Open-source code</h3>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic3} alt=""/>
                    </a>
                    <p> The AI labels the image quality of each region of the heart wall.</p>
                </div>
                <div className="section-body">
                    <p>
                        My code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/arqee">
                            https://github.com/GillesVanDeVyver/arqee</a>.
                        I provide comprehensive tutorials and examples on how to use the code.
                    </p>
                </div>
                <div className="section-title">
                    <h3> In conclusion</h3>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/journal/ultrasound-in-medicine-and-biology/vol/51/issue/4"
                       target="_blank" rel="noopener noreferrer">
                        <img src={quality_pic5} alt="" className="small-image"/>
                    </a>
                    <p> The article is on the cover page of its issue.</p>
                </div>
                <div className="section-body">
                    <p>
                        I created a real-time quality assessment tool for cardiac ultrasound images.
                        This tool can be used in many different applications, and I open sourced the code
                        to make it available to everyone. <br/><br/>
                        I also made a demo video to show our proof of concept in real-time on the ultrasound
                        scanner:&nbsp;
                        <a href="https://youtu.be/NXkR6rX14HQ">
                            Demo on YouTube</a>,
                    </p>
                </div>
                <div className="section-title">
                    <h3> Publication, presentation and award </h3>
                </div>
                <div className="media-section">
                    <a href="https://www.sciencedirect.com/science/article/pii/S0301562924004691">
                        <img src={quality_pic4} alt=""/>
                    </a>
                    <p> The poster presentation was awarded the runner-up prize for best poster in the ASMUS
                        workshop at MICCAI 2024.</p>
                </div>
                <div className="section-body">
                    <p> The work is published on Ultrasound in Medicine & Biology (UMB):&nbsp;
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
            </div>
        </div>
    );
}

export default RobustVisionEcho;
