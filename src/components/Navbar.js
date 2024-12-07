// src/components/Navbar.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import { scrollToSection } from './pages/Home';

const ContactLink = ({ onClick }) => {
  const navigate = useNavigate();
  const [navigationComplete, setNavigationComplete] = useState(false);

  useEffect(() => {
    if (navigationComplete) {
      onClick();
      setNavigationComplete(false);
    }
  }, [navigationComplete, onClick]);

  const handleClick = () => {
    navigate('/');
    setNavigationComplete(true);
  };

  return (
      <div className='nav-links' onClick={handleClick}>
        Contact
      </div>
  );
};

function Navbar() {
  const [click, setclick] = useState(false);
  const [dropdown, setDropdown] = useState(false);

  const handleClick = () => setclick(!click);

  const toggleDropdown = () => setDropdown(!dropdown);
  const closeMobileMenu = () => setclick(false);

  const handleProjectsClick = () => {
    toggleDropdown();
    closeMobileMenu();
  };

  const scrollTo = (sectionId) => {
    scrollToSection(sectionId);
  };

  const handleHomeClick = () => {
    closeMobileMenu();
    scrollTo('titleSection');
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
                <Link to='/' className='nav-links' onClick={handleHomeClick}>
                  Home
                </Link>
              </li>
              <li className='nav-item dropdown'>
                <div className='nav-links' onClick={toggleDropdown}>
                  Projects
                </div>
                {dropdown && (
                    <div className='dropdown-content'>
                      <Link to='/projects/data-analytics' onClick={handleProjectsClick}>Data Analytics</Link>
                      <Link to='/projects/finding-hearts' onClick={handleProjectsClick}>Finding hearts</Link>
                      <Link to='/projects/pattern-recognition' onClick={handleProjectsClick}>Pattern recognition</Link>
                    </div>
                )}
              </li>
              <li className='nav-item'>
                <Link to='/recommendation' className='nav-links' onClick={closeMobileMenu}>
                  Recommendation
                </Link>
              </li>
              <li className='nav-item'>
                <ContactLink onClick={() => {
                  closeMobileMenu();
                  scrollTo('contactSection');
                }} />
              </li>
            </ul>
          </div>
        </nav>
      </>
  );
}

export default Navbar;