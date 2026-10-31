import React from 'react';
import './AboutSection.css';

// The biking photo is not in the repo yet. To switch it on: drop the image at
// src/images/bike_trip.jpg, uncomment the import below, and set bikePhoto to it.
// Both lines are needed. CRA resolves imports at build time, so an import
// pointing at a missing file fails the build rather than degrading quietly.
//
// import bikeTrip from '../images/bike_trip.jpg';
const bikePhoto = null;

const PHOTO_CAPTION = 'Somewhere above the fjords, on a rare dry weekend.';

// The scroll-target id lives on the wrapper div in Home.js, so it is deliberately
// not repeated here: two elements sharing an id breaks getElementById scrolling.
function AboutSection() {
  return (
      <div className="about-section-container">
        <h2>About</h2>
        <section className={`about-section ${bikePhoto ? '' : 'about-section--text-only'}`}>
          <div className="about-text">
            <p>
              I work on applied AI. Distribution shift, overfitting, power consumption, memory
              constraints all have a say. The best model is not the largest or newest model,
              but the one that actually gives you what you need when you need it. The model is
              only one part. In practice, you need data collection, deployment, monitoring,
              evaluation, and continuous improvement to create real impact with AI.
            </p>
          </div>
          {bikePhoto && (
              <figure className="about-figure">
                <img src={bikePhoto} alt="Gilles on a cycling trip" className="about-image"/>
                <figcaption>{PHOTO_CAPTION}</figcaption>
              </figure>
          )}
        </section>
      </div>
  );
}

export default AboutSection;
