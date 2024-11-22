import React, { useEffect } from 'react';
import '../../App.css';
import TitleSection from '../TitleSection';
import ContactSection from '../ContactSection'; // Import the new ContactSection component
import Carousel from '../carousel';

// Function to handle smooth scrolling to the next section with an offset

export const getScrollPosition = (sectionId) => {
    const currentSection = document.getElementById(sectionId);
    if (currentSection) {
        const navbarHeight = document.querySelector('nav')?.offsetHeight || 0; // Fallback to 0 if navbar not found
        const sectionOffsetTop = currentSection.offsetTop; // Calculate offsetTop relative to the document
        const targetScrollPosition = sectionOffsetTop - navbarHeight;
        return targetScrollPosition;
    }
    return 0;
}

export const scrollToSection = (sectionId, scrollY = 0) => {

    const sectionOffsetTop = getScrollPosition(sectionId);

    // log the values to the console
    console.log('sectionOffsetTop:', sectionOffsetTop);

    window.scrollTo({
      top: sectionOffsetTop,
      behavior: 'smooth',
    });
};

function Home() {
  useEffect(() => {
    const adjustPadding = () => {
      const navbar = document.querySelector('nav'); // Adjust the selector to match your navbar
      const titleSectionParagraph = document.querySelector('.title-section p');
      const screenWidth = window.innerWidth;

      if (navbar && titleSectionParagraph) {
        const navbarHeight = navbar.offsetHeight;

        //if (screenWidth >= 768) { // Only adjust padding for screens wider than 768px
        //  const navbarHeight = navbar.offsetHeight;
        //  titleSectionParagraph.style.paddingTop = `${navbarHeight}px`;
        //} else {
        //  // reset to default padding
        //  titleSectionParagraph.style.paddingTop = '0';
        //}
      }
    };

    adjustPadding(); // Initial adjustment
    window.addEventListener('resize', adjustPadding); // Adjust on window resize

    return () => {
      window.removeEventListener('resize', adjustPadding); // Cleanup on component unmount
    };
  }, []); // Empty dependency array to run only once after the component mounts

  return (
    <>
      <div id="titleSection" className="title-section">
        <TitleSection />
      </div>
      <div id="carousel">
        <Carousel />
      </div>
      <div id="contactSection">
        <ContactSection />
      </div>
    </>
  );
}

export default Home;