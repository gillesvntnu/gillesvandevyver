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


function FindingHearts() {
    return (
        <div className="project-page-container">
            <h1>Finding Hearts</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    Academic projects focused on reliable and real-time image analysis for cardiac ultrasound during my
                    PhD.
                    The results are published in two first-author papers. YouTube demos:&nbsp;
                    <a href="https://www.youtube.com/watch?v=mj4PZtV6kkE&ab_channel=gillesvandevyver">Demo 1</a>,&nbsp;
                    <a href="https://www.youtube.com/watch?v=JnmtkZS1Fmk&ab_channel=gillesvandevyver">Demo 2</a>.
                    <br/>
                    <strong>Technologies used:</strong> Python, C++, PyTorch, graph neural networks
                </p>
            </div>

            <div className="horizontal-card horizontal-card-left">
                <div className="image-container">
                    <br/> <br/> <br/> <br/><br/><br/><br/>
                    <img src={agrrement_pic1} alt="" className="project-page-image-left"/>
                    <p>The disagreement of two independent networks is an indication of failure</p>
                    <img src={agrrement_pic2} alt="" className="project-page-image-left"/>
                    <p> Automatic segmentation of the heart</p>
                    <img src={agrrement_pic3} alt="" className="project-page-image-left"/>
                    <p> Failing case for the AI. In this case the bad image quality is to blame.
                        The result is a weird shape that does not make sense.</p>
                    <img src={agrrement_pic5} alt="" className="project-page-image-left"/>
                    <p> AI designed to create an anatomically valid contour.</p>
                    <br/>
                </div>

                <div>
                    <h2>When different neural networks disagree where the ❤️ is, something is wrong</h2>
                    <p>
                        One in three deaths in the United States is caused by cardiovascular diseases.
                        That's 702,880 per year, or 1 every 45 seconds, in the US alone.
                        At the heart of modern cardiology (see what I did there?),
                        ultrasound imaging is the standard way to assess cardiac health.
                        These imaging techniques allow us to determine important clinical parameters,
                        for example, how much blood the heart is pumping (the 'ejection fraction').
                        In the clinic today, the doctor must draw exactly where the heart is in the ultrasound
                        images to get these measurements right. This takes a lot of time,
                        and the doctor usually only bothers to do this for a single heartbeat.
                    </p>
                    <h3> How can AI help us? </h3>
                    <p>
                        By having an AI to automatically draw the contours of the heart ('segmentation'),
                        we can automate the measurements.
                        This way, we not only save time but also are
                        more robust because we can measure multiple heartbeats and get the exact same
                        answer every time for a given image.
                    </p>
                    <h3> So, what's the problem?</h3>
                    <p>
                        Because we are in the medical sector, we want the AI to be reliable.
                        It should work for every patient. One difficulty can be that ultrasound images can have
                        bad image quality.
                        Another difficulty is that each heart is different.
                        The AI might work well for healthy hearts, but it might fail when the heart has
                        unusual characteristics because the model is not used to these cases.
                        We see that when the model fails, it tends to produce weird shapes that
                        don’t make any anatomical sense.
                    </p>
                    <h3> How to solve this problem? </h3>
                    <p>
                        We made an AI designed specifically to avoid weird shapes and anatomical errors
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
                    <h3> In conclusion</h3>
                    <p>
                        If we want to make a more reliable AI, we need to teach it to imitate humans on
                        the more rare and interesting cases.
                        To find these cases, we can see how two different AIs, designed to avoid the mistakes
                        of the other, agree on where the heart is.
                        <br/> <br/>
                        Finally, we made a demo video to show our proof of concept in real-time on the
                        scanner:&nbsp;
                        <a href="https://www.youtube.com/watch?v=mj4PZtV6kkE&ab_channel=gillesvandevyver">
                            Demo on YouTube</a>,
                    </p>
                    <h3> Publication and presentation </h3>
                    The work is published in IEEE access: {'\n'}
                    <a href="https://ieeexplore.ieee.org/document/10458930">
                        Toward Robust Cardiac Segmentation Using Graph Convolutional Networks
                    </a>. <br/><br/>
                    It was also presented at the&nbsp;
                    <a href="https://ieee-uffc.org/event/symposium/2023-ieee-international-ultrasonics-symposium/">
                        2023 IEEE International Ultrasonics Symposium
                    </a> as a lecture.<br/><br/>
                </div>
            </div>
            <div className="horizontal-card horizontal-card-right">
                <div>
                    <h2>Does your heart look good?</h2>
                    <p>
                        Ultrasound imaging is amazing.
                        You take your ultrasound probe, put some gel on it, place it on your chest, and voila,
                        there you and your doctor can see your heart pumping.
                        But what do you see? For some patients, the images obtained during an echo have great
                        detail and the doctor can make accurate measurements of clinical measurements, while for
                        others the doctor can barely distinguish the contour of your heart.
                    </p>
                    <p>
                        In this work, I created a tool that automatically tells you how good or bad the quality
                        of the heart is, in real-time.
                        This can be useful in quantifying the quality of the image in many ways.
                        Maybe we are doing a large study on cardiac images and we want to exclude the ones where
                        the image quality is simply too bad.
                        Or maybe someone is developing a new ultrasound scanner and wants to quantify
                        the improvements in quality.
                        Clearly, a real-time quality assessment tool has many use cases.
                    </p>
                    <h3> How does it work? </h3>
                    <p>
                        Three senior clinicians came together to discuss how they define a good cardiac echo image.
                        Then, they put image quality labels on 458 echo images from 65 different study participants.
                        With this data, we trained a neural network to mimic the clinicians.
                        After extensive tuning and testing, we ended up with a model that can label the image
                        quality of cardiac images in real-time.
                        When testing the trained model, we found that the model tends to make fewer errors
                        than the clinicians among themselves!
                        This means it learned to strike a middle ground between the subjective
                        opinions of the different clinicians.
                    </p>
                    <h3> Open-source code</h3>
                    <p>
                        Our code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/arqee">
                            https://github.com/GillesVanDeVyver/arqee</a>.
                        We provide comprehensive tutorials and examples on how to use the code.
                    </p>
                    <h3> In conclusion</h3>
                    <p>
                        We created a real-time quality assessment tool for cardiac ultrasound images.
                        This tool can be used in many different applications, and we open sourced the code
                        to make it available to everyone. <br/><br/>
                        We made a demo video to show our proof of concept in real-time on the ultrasound
                        scanner:&nbsp;
                        <a href="https://www.youtube.com/watch?v=mj4PZtV6kkE&ab_channel=gillesvandevyver">
                            Demo on YouTube</a>,
                    </p>
                    <h3> Publication, presentation and award </h3>
                    The work is published on ArXiv:&nbsp;
                    <a href="https://arxiv.org/abs/2408.00591">
                        Regional quality estimation for echocardiography using deep learning
                    </a>. <br/><br/>
                    It was presented at the&nbsp;
                    <a href="https://ieee-uffc.org/event/symposium/2024-ultrasonics-ferroelectrics-and-frequency-control-joint-symposium">
                        2024 IEEE International Ultrasonics Symposium
                    </a> as a lecture. <br/><br/>
                    Additionally, the work was presented at the&nbsp;
                    <a href="https://conferences.miccai.org/2024/en/">
                        MICCAI (Medical Image Computing and Computer Assisted Intervention) 2024
                    </a> conference as a poster, where it was awarded the runner-up prize for best poster
                    in the ASMUS (Advances in Simplifying Medical Ultrasound) workshop.
                </div>
                <div className="image-container">
                    <br/> <br/> <br/> <br/><br/><br/><br/>
                    <img src={quality_pic1} alt="" className="project-page-image-right"/>
                    <p> </p>
                    <br/>
                    <img src={quality_pic2} alt="" className="project-page-image-right"/>
                    <p> These two echoes where obtained using the same scanner, yet the quality is vastly different </p>
                    <br/>
                    <img src={quality_pic3} alt="" className="project-page-image-right"/>
                    <p> The AI labels the image quality of each region of the heart wall </p>
                    <br/>
                    <img src={quality_pic4} alt="" className="project-page-image-right"/>
                    <p> The poster presentation was awarded the runner-up prize for best poster in the ASMUS workshop
                    at MICAII 2024</p>
                </div>
            </div>
        </div>
    );
}

export default FindingHearts;