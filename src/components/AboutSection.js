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
              I work on applied AI: models that have to run on real data, on real hardware, in
              the field. A model that works in a paper and a model that works in practice are
              different things, and most of my time goes into fixing that gap. These days that
              is on an embedded ultrasound device at Sonofit. Before that, a PhD on reliable
              deep learning for echocardiography at NTNU.
            </p>
            <p>
              Outside of that I am usually either on a mountain, on a bike, or both. A healthy
              mind in a healthy body, a bit cringe but it has truth in it.
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
