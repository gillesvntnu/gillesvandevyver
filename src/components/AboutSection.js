import React from 'react';
import './AboutSection.css';

// The biking photo is not in the repo yet. To switch it on: drop the image at
// src/images/bike_trip.jpg, uncomment the import below, and set bikePhoto to it.
// Both lines are needed — CRA resolves imports at build time, so an import
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
              I build machine learning systems for medical ultrasound. My PhD at NTNU, in the
              Faculty of Medicine and Health Sciences, asked a question that sounds simple and
              is not: how do you make a deep learning model for echocardiography that a
              clinician can actually rely on? Not just accurate on a benchmark, but honest
              about its own uncertainty, stable on the messy images real hospitals produce, and
              fast enough to run while the probe is still on the patient.
            </p>
            <p>
              That work spanned anatomically constrained segmentation, automatic image quality
              assessment, and generative augmentation for training data that is otherwise
              impossible to share. I care about the unglamorous half of the problem — the
              validation, the failure modes, the question of whether a number on a slide
              survives contact with a different scanner and a different sonographer.
            </p>
            <p>
              Outside of that I am usually on a bike. Long days, bad weather, questionable
              route planning. It is the closest thing I have found to debugging: you are alone
              with one problem for a very long time, and eventually it gives.
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
