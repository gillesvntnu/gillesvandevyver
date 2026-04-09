import React from 'react';
import './NaturalLanguageProcessing.css';
import gen_ai_pic0 from '../../../images/gen_ai/gen_ai_pic0.jpg';
import gen_ai_pic1 from '../../../images/gen_ai/gen_ai_pic1.png';
import gen_ai_pic2 from '../../../images/gen_ai/gen_ai_pic2.png';
import gen_ai_pic3 from '../../../images/gen_ai/gen_ai_pic3.png';
import gen_ai_transition from '../../../images/gen_ai/gen_ai_transition.gif';


const GenerativeAI = () => {
    return (
        <div className="project-page-container">
            <h1>Generative AI</h1>
            <div className="horizontal-card horizontal-card-right">
                <div className="section-title">
                    <h2> Generating echo images of the heart </h2>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic0} alt=""/>
                    </a>
                </div>
                <div className="section-body">
                    <p>
                        In the AI era, data is gold.
                        AI tools are only as good as the data on which they are trained.
                        This is especially the case in the medical domain, since measurements are labor intensive
                        and in practice even experienced cardiologists do not agree on a single way of measuring.
                        In practice this means that data from one data center can usually not be used together with
                        data in another datacenter without losing quality and consistency.
                    </p>
                </div>
                <div className="section-title">
                    <h3> Generative AI </h3>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic1} alt=""/>
                    </a>
                    <p> Generative augmentations can put existing annotated data in a new context.</p>
                </div>
                <div className="section-body">
                    <p>
                        Generative AI can generate highly realistic images in a certain domain.
                        The tricky part is that the generative images are not always accurate and can not really be
                        trusted.
                        This would mean we lose the quality of the annotations in the data from the experienced
                        cardiologists and we are back at square one.
                    </p>
                </div>
                <div className="section-title">
                    <h3> Augmentation </h3>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_transition} alt="" className="small-image"/>
                    </a>
                    <p> The generative AI is a diffusion model that generates content from noise.</p>
                </div>
                <div className="section-body">
                    <p>
                        By using generative AI to modify only specific parts of images
                        without affecting regions that rely on precise clinician annotations,
                        we can expand and diversify our dataset without compromising quality.
                        In this approach, we keep the annotated areas and place them in new contexts or settings,
                        a process known as augmentation.
                        This allows our models to perform across a wider range of scenarios while maintaining
                        the high standard of quality.
                    </p>
                </div>
                <div className="section-title">
                    <h3> Open-source code</h3>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic2} alt=""/>
                    </a>
                    <p> An existing image of a heart is put in a new position and made to look realistic
                        by using the generative model.</p>
                </div>
                <div className="section-body">
                    <p>
                        My code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/EchoGAINS">
                            https://github.com/GillesVanDeVyver/EchoGAINS</a>.
                        I provide a comprehensive tutorial on how to use the code.
                    </p>
                </div>
                <div className="section-title">
                    <h3> In conclusion </h3>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic3} alt=""/>
                    </a>
                    <p> Models trained with the augmented dataset generalize better and are more robust.</p>
                </div>
                <div className="section-body">
                    <p>
                        In this project, I created a generative model that can augment
                        an echocardiography dataset to create a more diverse dataset.
                        Deep learning models trained on this dataset can generalize better to different scenarios
                        and be more robust in practice.
                        I also made a demo video to show our proof of concept in real-time on the ultrasound
                        scanner:&nbsp;
                        <a href="https://youtu.be/4lwMv-oU-fA">
                            Demo on YouTube</a>,
                    </p>
                </div>
                <div className="text-section">
                    <h3> Publication </h3>
                    <p> The academic paper is available as a preprint on ArXiv:&nbsp;
                        <a href="https://arxiv.org/abs/2502.20100">
                            Generative augmentations for improved cardiac ultrasound segmentation using diffusion models
                        </a>.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default GenerativeAI;
