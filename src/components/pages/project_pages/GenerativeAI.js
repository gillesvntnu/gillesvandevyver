import React from 'react';
import './NaturalLanguageProcessing.css';
import gen_ai_pic1 from '../../../images/gen_ai/gen_ai_pic1.png';
import gen_ai_pic2 from '../../../images/gen_ai/gen_ai_pic2.png';
import gen_ai_pic3 from '../../../images/gen_ai/gen_ai_pic3.png';
import gen_ai_transition from '../../../images/gen_ai/gen_ai_transition.gif';


const GenerativeAI = () => {
    return (
        <div className="project-page-container">
            <h1>Gnerative AI</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    In this research project, I created a generative model that can augment
                    a echocardiography dataset to create a more diverse dataset,
                    increasing the feasibility and robustness of deep learning models trained on this dataset.
                    <br/>
                    <strong>Technologies used:</strong> Diffusion models, Pytorch, Python, C++
                </p>
            </div>
            <div className="horizontal-card horizontal-card-right">
                <div>
                    <h2> Generating echo images of the heart </h2>
                    <p>
                        In the AI era, data is gold.
                        AI tools are only as good as the data it is trained on.
                        This is especially the case in the medical domain, since measurements are labor intensive
                        and even experienced cardiologists do not agree on a single way of measuring.
                        In practice this means that data from one data center can usually not be used together with
                        data in another datacenter without losing quality and consistency.
                    </p>
                    <h2> Generative AI </h2>
                    <p>
                        Generative AI can generate highly realistic images in a certain domain.
                        The tricky part is that the generative images are not always accurate and can not really be
                        trusted.
                        This would mean we lose the quality of the annotations in the data from the experienced
                        cardiologists and we are back at square one.
                    </p>
                    <h2> The combo </h2>
                    <p>
                        By using generative AI not to create full images, but only replace parts of the images
                        where we do not rely on the very precise annotations of the clinician, we can grow and
                        diversify our dataset without hampering the quality.
                        In other words, we take the parts of the images with precise annotations
                        and put them in another context or setting, also called augmentation.
                        This way, our models can work in more different scenarios with the same quality
                        we regard so highly.
                    </p>
                    <p>
                        In this project I focus on echocardiology.
                        Here, the context is about where the heart is inside the image and how it is positioned.
                        Specifically, most of the images in our internal dataset from the hospital are
                        so called left ventricle (LV) focused, which means that the image is zoomed in on the LV in
                        the middle of the image.
                        This is the clinically recommended way of taking images, but in practice, the images are not
                        always taken this way.
                        For example, the operator might not be experienced, the image quality might be better when
                        deviating from the recommended way, or the heart of the patient itself might make it
                        difficult or impossible to have a clear, LV-focused image.
                        When training a deep learning model on only LV-focused images,
                        the model will not be able to generalize to these other scenarios.
                        When training with the augmented images, the model generalizes better and can be used in
                        more scenarios, meaning higher feasibility and robustness.
                    </p>
                    <h2> In conclusion </h2>
                    <p>
                        In this research project, I created a generative model that can augment
                        a echocardiography dataset to create a more diverse dataset.
                        Deep learning models trained on this dataset can generalize better to different scenarios
                        and be more robust in practice.
                    </p>
                    <h3> Publication, presentation and award </h3>
                    <p>
                        TBA
                    </p>
                </div>
                <div className="image-container">
                <br/> <br/> <br/> <br/><br/><br/><br/>
                    <a href="">
                        <img src={gen_ai_pic1} alt="" className="project-page-image-right"/>
                    </a>
                    <p> Generative augmentations can put existing annotated data in a new context.</p>
                    <a href="">
                        <img src={gen_ai_transition} alt="" className="project-page-image-right small-image"/>
                    </a>
                    <p> The generative AI is a diffusion model that generates content from noise.</p>
                    <a href="">
                        <img src={gen_ai_pic2} alt="" className="project-page-image-right"/>
                    </a>
                    <p> An existing image of a heart is put in a new position and made to look realistic
                        by using the generative model.</p>
                    <a href="">
                        <img src={gen_ai_pic3} alt="" className="project-page-image-right"/>
                    </a>
                    <p> Models trained with the augmented dataset generalize better and are more robust.</p>

                    <br/>
                </div>
            </div>
        </div>
    );
}

export default GenerativeAI;