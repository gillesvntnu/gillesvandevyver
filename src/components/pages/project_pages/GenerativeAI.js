import React from 'react';
import './NaturalLanguageProcessing.css';
import wip from "../../../images/nlp/wip.jpeg";

const GenerativeAI = () => {
    return (
        <div className="project-page-container">
            <h1>Gnerative AI</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    This work is not yet published. Coming soon!
                    <br/>
                    <strong>Technologies used:</strong> Diffusion models, Pytorch, Python, C++
                </p>
            </div>
            <div className="horizontal-card">
                <div className="image-container">
                    <img src={wip} alt="" className="project-page-image-left"/>
                </div>
                <div>
                    <h2> Generating echo images of the heart </h2>
                    <p>
                        This work is not yet published. Coming soon!
                    </p>
                </div>
            </div>
        </div>
    );
}

export default GenerativeAI;