// src/components/Navbar.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';
import {getScrollPosition, scrollToSection} from './pages/Home'; // Import the scrollToNextSection function

function Navbar() {
  const [click, setclick] = useState(false);
  const [dropdown, setDropdown] = useState(false);

  const handleClick = () => setclick(!click);
  const closeMobileMenu = () => setclick(false);
  const toggleDropdown = () => setDropdown(!dropdown);


  const scrollTo = (sectionId) => {
    window.scrollTo({
      top: 0,
      behavior: 'instant',
    });
    scrollToSection(sectionId);
    }

  const handleHomeClick = () => {
    closeMobileMenu();
    scrollTo("titleSection");
  };

  return (
      <>
        <nav className='navbar'>
          <div className='navbar-container'>
            <div className='menu-icon' onClick={handleClick}>
              <i className={click ? 'fas fa-times' : 'fas fa-bars'} />
            </div>
            <ul className={click ? 'nav-menu active' : 'nav-menu'}>
              <li className='nav-item'>
                <Link to='/' className='nav-links' onClick={
                  handleHomeClick
                }>
                  Home
                </Link>
              </li>
              <li className='nav-item dropdown'>
                <div className='nav-links' onClick={toggleDropdown}>
                  Projects
                </div>
                {dropdown && (
                    <div className='dropdown-content'>
                      <Link to='/projects/data-analytics' onClick={closeMobileMenu}>Data Analytics</Link>
                      <Link to='/projects/finding-hearts' onClick={closeMobileMenu}>Finding hearts</Link>
                      <Link to='/projects/natural-language-processing' onClick={closeMobileMenu}>Natural language
                        processing</Link>
                      <Link to='/projects/pattern-recognition' onClick={closeMobileMenu}>Pattern recognition</Link>
                    </div>
                )}
              </li>
              <li className='nav-item'>
                <a href='#' className='nav-links' onClick={() => {
                  closeMobileMenu();
                  scrollTo("contactSection");
                }}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </>
  );
}

export default Navbar;