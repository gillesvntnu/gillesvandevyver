import React from 'react';
import './CommonStyles.css';
import tennis_courts from '../../../images/pattern-recognition/tennis_courts.png';
import vit1 from '../../../images/pattern-recognition/vit1.png';
import vit2 from '../../../images/pattern-recognition/vit2.png';

function PatternRecognition() {
    return (
        <div className="project-page-container">
            <h1>Pattern Recognition</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    The first project uses supervised deep learning for tennis court detection in satellite images.
                    The second project uses the vision transformer for detecting broken industrial machines.
                    <br/>
                    <strong>Technologies used:</strong> Python, TensorFlow (Keras), YOLOv4, Vision Transformer
                </p>
            </div>

            <div className="horizontal-card">
                <div>
                    <h2> Detecting machine failures with microphones</h2>
                    <p>
                        Industrial machines can easily cost hundreds of thousands of dollars.
                        Proactive maintenance and repair can save a lot of money by avoiding downtime and the cost of
                        replacing parts or the entire machine.
                        Microphones are a great choice because they’re usually inexpensive and, unlike just looking
                        at a machine, the sound can reveal what’s happening inside.
                        The challenge is that the sound is not always easy to interpret and a subtle change in sound
                        can be a sign of a problem. This is where AI can help.
                    </p>
                    <h3> The challenge </h3>
                    <p>
                        In a realistic scenario in industrial factories, the sound of the machines can only be
                        recorded when the machine is running correctly.
                        There is also a lot of background noise in the factory and we might want to use our
                        AI system on different versions of machines or in a different environment than where
                        its training data was collected. If that wasn't enough, the amount of data was limited.
                        This was the setting for the DCASE (Detection and Classification of Acoustic Scenes and Events)
                        2021 challenge, where I did my master's thesis on.
                    </p>
                    <h3> Our solution </h3>
                    <p>
                        At the time of the challenge, the Vision Transformer (ViT) was the new kid on the block in
                        deep learning. The attention mechanism had shown great promise in natural language processing
                        and natural images by focusing on the important parts of the data.
                        In our case, the sound data was typically represented as spectrograms,
                        which represent the contribution of different frequencies over time.
                        The attention mechanism was promising because typically only specific frequencies at specific
                        time points are important and indicative of a problem.
                        The downside of the transformer models is that they are very data-hungry, and we had very
                        little data.
                        We used a model pretrained on both natural images and spectrograms to extract features and
                        only trained a small part of the model on our limited data. This allowed us to use the
                        powerful feature extraction capabilities of the transformer model without overfitting.
                    </p>
                    <h3> Publication and presentation </h3>
                    <p>
                        The work was published as a proceeding:&nbsp;
                        <a href="https://ieeexplore.ieee.org/abstract/document/9980266">
                            Adapted Spectrogram Transformer for Unsupervised Cross-Domain Acoustic Anomaly Detection
                        </a> <br/> <br/>
                        and presented as a lecture at the&nbsp;
                        <a href="https://ieeexplore.ieee.org/xpl/conhome/9979726/proceeding">
                            2022 APSIPA annual summit and conference.
                        </a>
                    </p>
                </div>
                <div className="image-container">
                    <br/> <br/> <br/> <br/><br/><br/><br/>
                    <a href="https://ieeexplore.ieee.org/abstract/document/9980266">
                        <img src={vit1} alt="Pattern Recognition" className="project-page-image-right"/>
                    </a>
                    <p> The audio data was represented as spectrograms.</p>
                    <a href="https://ieeexplore.ieee.org/abstract/document/9980266">
                        <img src={vit2} alt="Pattern Recognition" className="project-page-image-right"/>
                    </a>
                        <p> The attention mechanism of the vision transformer could also be used on spectrograms.</p>
                </div>
            </div>
            <div className="horizontal-card">
                <div className="image-container">
                    <br/> <br/> <br/> <br/><br/><br/><br/>
                    <img src={tennis_courts} alt="Pattern Recognition" className="project-page-image-left"/>
                    <p> It was a challenge for the model to get the exact number of tennis courts.</p>
                </div>
                <div>
                    <h2> Finding tennis courts in satellite images</h2>
                    <p>
                        How many tennis courts are there in all of Flanders, Belgium?
                        That was the question Sweco wanted to know.
                        There is no central database of tennis courts in Belgium and the municipal data
                        on this is untrustworthy and aged.
                        So, what now? Well, we quickly came to the conclusion that we can simply count the
                        number of tennis courts from satellite images, which are publicly available by the government.
                        We then had two options.
                        Sending the data to a labeling team or developing a deep learning AI that can detect the
                        tennis courts automatically.
                    </p>
                    <p>
                        My role in this was to test the waters of what the current AI at that time (2021) was capable
                        of.
                        How much data was needed to create a reliable model?
                        How long does it take to develop and deploy these models?
                        Is it cost-effective?
                        In fact, the specific task of the tennis courts was mostly only an experimental case.
                        If the AI could detect tennis courts, it could detect other buildings or objects as well,
                        given the right training data.
                    </p>
                    <h3>Exploring AI Capabilities</h3>
                    <p>
                        The YOLOv4 model was a logical choice for this task as it was the current state-of-the-art
                        and widely used in the industry for object detection with deep learning.
                        With a few lines of code, we had a model pretrained on cats and dogs that
                        we now could fine-tune on tennis courts.
                        Now the boring part started: collecting the data.
                        We found that in order to get a reliable model, we needed to manually label large parts of
                        Flanders.
                        We found that the model learned quickly to detect tennis courts, but it was not reliable
                        enough. Getting the exact number of tennis courts and not getting confused by red roofs
                        or other sports fields was a challenge.
                        We would need to label even more data or spend considerable time on improving the model.
                        We concluded that the benefits were not worth the costs in this case.
                        Although the model was not deployed in the end, the project was a great learning experience
                        for both me and the management, who were not familiar with the capabilities of AI.
                    </p>
                    <p>
                        Thinking back on the project, it would be interesting to see what conclusions we could draw
                        if we would use the current state-of-the-art models and techniques.
                        Large foundation models have shown that they can learn to detect objects with very little
                        training data.
                        Also more general models like the GPT based models have shown impressive zero-shot
                        performance on a wide range of tasks.
                        These are interesting times to be alive.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default PatternRecognition;