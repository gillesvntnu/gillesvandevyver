import React from 'react';
import './CommonStyles.css';
import demoVideo from '../../../vidoes/agentic_ai/deepecho_agentic_demo.webm';

const AgenticAI = () => {
    return (
        <div className="project-page-container">
            <h1>Agentic AI</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    A local agentic chat interface for analyzing cardiac ultrasound data using deep learning.
                    The system integrates view classification, cardiac cycle timing detection, left ventricle segmentation,
                    ejection fraction calculation, and image quality assessment into a single conversational tool.
                    <br/>
                    <strong>Technologies used:</strong> Python, TensorFlow, Open Interpreter, Server-Sent Events, Anthropic Claude API, Ollama
                </p>
            </div>
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
                        In clinical cardiology, analyzing echocardiography data involves a series of steps:
                        identifying the view, finding the right frames in the cardiac cycle,
                        drawing the contours of the heart, and computing measurements like the ejection fraction.
                        Each step typically requires separate tools, manual interaction, and domain expertise.
                        What if you could just ask a question in plain language and get the answer?
                    </p>
                    <h3>The agentic approach</h3>
                    <p>
                        DeepEcho Agent is a locally-hosted chat interface that connects a large language model
                        to a suite of deep learning models for cardiac ultrasound analysis.
                        Instead of clicking through multiple tools, the user simply types a request
                        like "calculate the ejection fraction for patient 3110" and the agent figures out
                        all the intermediate steps: classifying the view, detecting end-systole and end-diastole,
                        segmenting the left ventricle, and computing the final measurement.
                    </p>
                    <h3>Under the hood</h3>
                    <p>
                        The system uses Open Interpreter to give the language model the ability to execute Python code.
                        Behind the scenes, this code calls into a library of deep learning models
                        that I developed during my PhD research.
                        The view classifier identifies the echocardiographic view (A4C, A2C, PLAX, PSAX, ALAX)
                        using a TensorFlow protobuf model.
                        A Conv3D+LSTM temporal model detects the end-systolic and end-diastolic frames
                        in the cardiac cycle.
                        A dedicated segmentation network outlines the left ventricle, and from there,
                        the ejection fraction is computed using Simpson's method of disks.
                    </p>
                    <h3>Flexible model backend</h3>
                    <p>
                        The agent supports multiple language model backends.
                        It can run locally using Ollama with models like Qwen, or connect to cloud-hosted
                        models from Anthropic (Claude Haiku, Sonnet, and Opus) via the API.
                        The user can switch models on the fly from the interface,
                        making it easy to trade off between speed, cost, and capability.
                    </p>
                    <h3>Image quality assessment</h3>
                    <p>
                        Beyond measurements, the agent can also assess the quality of the ultrasound images
                        using the regional quality scoring model from my published research.
                        This lets users quickly identify recordings where the image quality might
                        compromise the reliability of automated measurements.
                    </p>
                    <h3>Design philosophy</h3>
                    <p>
                        The agent is designed with a strict anti-hallucination policy.
                        Every output must come from actual code execution, not from the language model's
                        knowledge or assumptions.
                        If the model cannot run the code successfully, it reports the error
                        rather than guessing an answer.
                        This is critical in a medical context where incorrect values could mislead
                        clinical decision-making.
                    </p>
                    <h3>Real-time streaming</h3>
                    <p>
                        The web interface uses Server-Sent Events (SSE) to stream the agent's
                        responses in real time.
                        As the agent reasons, writes code, executes it, and generates visualizations,
                        each step appears live in the chat — similar to how Claude Desktop displays
                        its thinking process.
                        Code blocks, execution output, and generated images are all rendered inline.
                    </p>
                    <h3>In conclusion</h3>
                    <p>
                        DeepEcho Agent brings together several years of cardiac ultrasound AI research
                        into a single, conversational interface.
                        By combining agentic code execution with specialized deep learning models,
                        it makes complex echocardiographic analysis accessible through natural language,
                        while maintaining the reliability standards required in a medical setting.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default AgenticAI;
