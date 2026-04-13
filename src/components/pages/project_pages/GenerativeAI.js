import React from 'react';
import './NaturalLanguageProcessing.css';
import VideoPlayer from '../../viewers/VideoPlayer';
import demoVideo from '../../../vidoes/genertive_ai/gen_augmention_demo.mp4';
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
                <div style={{gridColumn: '1 / -1', display: 'flex', justifyContent: 'center'}}>
                    <VideoPlayer src={demoVideo} type="video/mp4" ariaLabel="Generative augmentation demo" />
                </div>
                <div className="section-title">
                    <h2> <br/><br/> Generating echo images of the heart </h2>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic0} alt=""/>
                    </a>
                </div>
                <div className="section-body">
                    <p>
                        AI tools are only as good as the data on which they are trained.
                        This is especially the case in the medical domain. 
                        Generative AI can generate highly realistic images.
                        The tricky part is that the generative images are not always accurate and can not really be
                        trusted because of hallucations.
                        This would mean we lose the quality of the annotations in the data.
                    </p>
                </div>
                <div className="section-title">
                    <h3> Augmentation </h3>
                </div>
                <div className="section-body">
                    <p>
                        By using generative AI to modify only specific parts of images
                        without affecting regions that rely on precise clinician annotations,
                        we can expand and diversify our dataset without compromising quality.
                        In this approach, we keep the annotated areas and place them in new contexts or settings.
                        This allows our models to perform across a wider range of scenarios while maintaining
                        the high standard of annotation quality.
                    </p>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic1} alt=""/>
                    </a>
                    <p> Generative augmentations can put existing annotated data in a new context.</p>
                </div>
                <div className="section-title">
                    <h3> Code and publication</h3>
                </div>
                <div className="section-body">
                    <p>
                        My code is available as a Python library at&nbsp;
                        <a href="https://github.com/GillesVanDeVyver/EchoGAINS">
                            https://github.com/GillesVanDeVyver/EchoGAINS</a>.
                        The academic paper is published in Nature Scientific Reports:&nbsp;
                        <a href="https://www.nature.com/articles/s41598-025-21938-y">
                            Generative augmentations for improved cardiac ultrasound segmentation using diffusion models
                        </a>.
                    </p>
                </div>
                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_transition} alt="" className="small-image"/>
                    </a>
                    <p> The generative AI is a diffusion model that generates content from noise.</p>
                </div>


                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic2} alt=""/>
                    </a>
                    <p> An existing image of a heart is put in a new position and made to look realistic
                        by using the generative model.</p>
                </div>

                <div className="media-section">
                    <a href="https://arxiv.org/abs/2502.20100">
                        <img src={gen_ai_pic3} alt=""/>
                    </a>
                    <p> Models trained with the augmented dataset generalize better and are more robust.</p>
                </div>
            </div>
        </div>
    );
}

export default GenerativeAI;
