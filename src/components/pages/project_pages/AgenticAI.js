import React from 'react';
import './CommonStyles.css';
import demoVideo from '../../../vidoes/agentic_ai/deepecho_agentic_demo.webm';

const AgenticAI = () => {
    return (
        <div className="project-page-container">
            <h1>Agentic AI</h1>
            <div className="vertical-card">
                <video
                    controls
                    style={{width: '100%', maxWidth: '800px', borderRadius: '1vh'}}
                >
                    <source src={demoVideo} type="video/webm"/>
                    Your browser does not support the video tag.
                </video>
                <div style={{marginTop: '2rem'}}>
                    <h2>An AI assistant for cardiac ultrasound analysis</h2>
                    <p>
                        In clinical cardiology, analyzing echocardiography data typically involves a series of steps:
                        identifying the view, finding the right frames in the cardiac cycle,
                        drawing the contours of the heart, and computing measurements like the ejection fraction.
                        Each step typically requires separate tools, manual interaction, and domain expertise.
                        What if you could just ask a question in plain language and get the answer?
                    </p>
                    <h3>The agentic approach</h3>
                    <p>
                        DeepEcho Agentic is a locally-hosted chat interface that connects a large language model
                        to a set of deep learning tools for cardiac ultrasound analysis.
                        Instead of clicking through multiple tools, the user simply types a request
                        like "calculate the ejection fraction for patient 3110" and the agent figures out
                        all the intermediate steps: classifying the view, detecting end-systole and end-diastole,
                        segmenting the left ventricle, and computing the final measurement.
                    </p>
                    <h3>Flexible model backend</h3>
                    <p>
                        The agent supports multiple language model backends.
                        It can run locally using open source models like Ollama, or connect to cloud-hosted
                        models an API key. The user can switch models on the fly from the interface.
                    </p>
                    <h3>In conclusion</h3>
                    <p>
                        By combining agentic code execution with specialized deep learning models,
                        DeepEcho agentic makes complex echocardiographic analysis accessible through natural language,
                        while maintaining the reliability of tested tools.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default AgenticAI;
