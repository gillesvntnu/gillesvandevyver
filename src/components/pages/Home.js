import React, { useEffect } from 'react';
import '../../App.css';
import TitleSection from '../TitleSection';
import ContactSection from '../ContactSection';
import Carousel from '../carousel';

export const getScrollPosition = (sectionId) => {
    const currentSection = document.getElementById(sectionId);
    if (currentSection) {
        const navbarHeight = document.querySelector('nav')?.offsetHeight || 0;
        const sectionOffsetTop = currentSection.offsetTop;
        const targetScrollPosition = sectionOffsetTop - navbarHeight;
        return targetScrollPosition;
    }
    return 0;
}

export const scrollToSection = (sectionId, scrollY = 0) => {
    const sectionOffsetTop = getScrollPosition(sectionId);
    console.log('sectionOffsetTop:', sectionOffsetTop);
    window.scrollTo({
        top: sectionOffsetTop,
        behavior: 'smooth',
    });
};

function Home() {
    useEffect(() => {
        document.title = 'gillesvandevyver.com';

        const adjustPadding = () => {
            const navbar = document.querySelector('nav');
            const titleSectionParagraph = document.querySelector('.title-section p');
            const screenWidth = window.innerWidth;

            if (navbar && titleSectionParagraph) {
                const navbarHeight = navbar.offsetHeight;
            }
        };

        adjustPadding();
        window.addEventListener('resize', adjustPadding);

        return () => {
            window.removeEventListener('resize', adjustPadding);
        };
    }, []);

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