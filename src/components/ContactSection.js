import React, { useState, useRef } from 'react';
import './ContactSection.css';

function ContactSection() {
  const [copiedMessage, setCopiedMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const timeoutRef = useRef(null);

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(`${type} copied to clipboard`);
      setVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setVisible(false), 3000); // Hide the message after 3 seconds
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  const goToLink = (url) => {
    window.open(url, '_blank');
  };

  return (
      <div className='contact-section-container'>
        <h2>Get in touch</h2>
        <section className='contact-section'>
          <div className='contact-column'>
            <p
                className='contact-item'
                onClick={() => copyToClipboard('gillesvandevyver@hotmail.be', 'E-mail address')}
                onMouseEnter={() => setHoveredItem('email')}
                onMouseLeave={() => setHoveredItem(null)}
            >
              <i className="fas fa-envelope"></i> gillesvandevyver@hotmail.be
              <span className={`copy-icon ${hoveredItem === 'email' ? 'visible' : ''}`}><i
                  className="fas fa-copy"></i></span>
            </p>
            <p
                className='contact-item'
                onClick={() => copyToClipboard('+32474079443', 'Phone number')}
                onMouseEnter={() => setHoveredItem('phone')}
                onMouseLeave={() => setHoveredItem(null)}
            >
              <i className="fas fa-phone"></i> +32474079443
              <span className={`copy-icon ${hoveredItem === 'phone' ? 'visible' : ''}`}><i
                  className="fas fa-copy"></i></span>
            </p>
              <p
                  className='contact-item link-item'
                  onClick={() => goToLink('https://www.linkedin.com/in/gilles-van-de-vyver/')}
                  onMouseEnter={() => setHoveredItem('linkedin')}
                  onMouseLeave={() => setHoveredItem(null)}
              >
                <i className="fab fa-linkedin"></i> LinkedIn
              </p>
              <p
                  className='contact-item link-item'
                  onClick={() => goToLink('https://github.com/gillesvntnu', 'GitHub profile')}
                  onMouseEnter={() => setHoveredItem('github')}
                  onMouseLeave={() => setHoveredItem(null)}
              >
                <i className="fab fa-github"></i> GitHub
              </p>
            </div>
        </section>
        <div className='bottom-whitespace'>
          <h6 className={`copied-message ${visible ? 'visible' : ''}`}>{copiedMessage}</h6>
        </div>
        <p className='copyright'>© Copyright 2024 Gilles Van De Vyver. All rights reserved.</p>
      </div>
  );
}

export default ContactSection;