import React from 'react';
import './NaturalLanguageProcessing.css';
import wip from "../../../images/nlp/wip.jpeg";
import nlp1 from "../../../images/nlp/nlp1.png";
import nlp2 from "../../../images/nlp/nlp2.png";

const NaturalLanguageProcessing = () => {
    return (
        <div className="project-page-container">
            <h1>Natural language processing</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    The first project was a project on NLP (Natural Language Processing) in the early days of
                    language models. The second project is work in progress on a personal chatbot.
                    <br/>
                    <strong>Technologies used:</strong> Python, Word2Vec, BERT
                </p>
            </div>
            <div className="horizontal-card">
                <div>
                    <h2> Word2Mat: using matrices to capture word order in NLP </h2>
                    <p>
                        It's 2019, a group of deep learning students decide to do our own deep learning project.
                        Our interest gets sparked by the idea of Word2Vec, a model that represents words as vectors.
                        This basically means words a re represented as a series of numbers that a computer can
                        understand.
                        This was before the GPT models made their breakthrough, and many state-of-the-art NLP
                        (Natural Language Processing) models relied heavily on Word2Vec.
                        We noticed that there is a conceptual problem with Word2Vec: it doesn't take word order
                        into account.
                        For example, "The quick brown fox jumps over the lazy dog" and "The lazy dog jumps over
                        the quick brown fox" would be the same during the training of Word2Vec.
                        This happens because Word2Vec only represents individual words as vectors,
                        and&nbsp;
                        <div className="equation">
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            a +&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            b =&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            b +&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            a.
                        </div>
                        for vectors.
                    </p>
                    <p>
                        So, we set out and create Word2Mat with our hopes to revolutionize the
                        world of NLP.
                        With Word2Mat, instead of representing words as vectors, we represent them as matrices,
                        and because for matrices&nbsp;
                        <div className="equation">
                            <div>
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            A +&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            B ≠&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            B +&nbsp;
                            <span className="arrow-wrapper"><span className="arrow">→</span></span>
                            A
                            </div>
                        </div>
                        we can take word order into account.
                        Of course we didn't revolutionize anything and our model was probably not even close to
                        state-of-the-art, but it did actually work to some extent and we could show how our
                        model was taking word order into account.
                        In fact, not much later a paper was published with the same idea.
                        Dunning-Kruger effect? Probably. Valuable experience? Definitely.
                    </p>
                </div>
                <div className="image-container">
                    <img src={nlp1} alt="" className="project-page-image-right resized-nlp-image"/>
                    <p> Word2Vec represents words as vectors. In practice, there are 300 numbers/dimensions per word.
                        Here we show a simplified version with 2 dimensions. </p>
                    <img src={nlp2} alt="" className="project-page-image-right "/>
                    <p> In Word2Vec, the order of words is not taken into account </p>
                </div>
            </div>
            <div className="horizontal-card">
                <div className="image-container">
                    <img src={wip} alt="" className="project-page-image-left"/>
                </div>
                <div>
                    <h2> Personal chatbot </h2>
                    <p>
                        Coming soon!
                    </p>
                </div>
            </div>
        </div>
    );
}

export default NaturalLanguageProcessing;