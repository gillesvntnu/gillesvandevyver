import React from 'react';
import './TitleSection.css';
import img1 from '../images/profile_pic_black_white.jpeg'; // Adjusted path
import { scrollToSection } from './pages/Home'; // Import the scrollToNextSection function

function TitleSection() {
  return (
      <div className="title-section" id="titleSection">
          <div className='title-section-text'>
              <p>Gilles Van De Vyver</p>
              <p> <br /> </p>
              <h1>Software & Machine Learning Engineer <br />  Building AI for Ultrasound</h1>
              <button className="centered-button" onClick={() => scrollToSection('carousel')}>
                View my projects
              </button>
          </div>
          <div className="title-image-container">
              <img src={img1} alt="Profile picture" className="title-image"/>
          </div>
      </div>
  );
}

export default TitleSection;