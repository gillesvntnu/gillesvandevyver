import React from 'react';
import './carousel.scss';
import data_analytics_pic from '../images/data_analytics/data_analytics.jpeg'
import computer_vision_pic from '../images/finding_hearts/computer_vision_meddical_imaging.jpg'
import spectrogram_pic from '../images/pattern-recognition/sound_waves.jpeg'
import gen_ai_transition from '../images/gen_ai/gen_ai_transition.gif'

const slideData = [
  {
    index: 0,
    headline: 'Data Analytics',
    button: 'Find out more',
    src: data_analytics_pic,
    link: '#/projects/data-analytics'
  },
  //{
  //  index: 1,
  //  headline: 'Generative AI for medical imaging',
  //  button: 'Find out more',
  //  src: '',
  //  link: '/generative-ai'
  //},
  {
    index: 1,
    headline: 'Finding hearts',
    button: 'Find out more',
    src: computer_vision_pic,
    link: '#/projects/finding-hearts'
  },
  //{
  //  index: 2,
  //  headline: 'Natural language processing',
  //  button: 'Find out more',
  //  src: chatbot_pic,
  //  link: '#/projects/natural-language-processing'
  //},
  {
    index: 2,
    headline: 'Generative AI',
    button: 'Find out more',
    src: gen_ai_transition,
    link: '#/projects/generative-ai'
  },
  {
    index: 3,
    headline: 'Pattern recognition',
    button: 'Find out more',
    src: spectrogram_pic,
    link: '#/projects/pattern-recognition'
  }
];
  
  
  // =========================
  // Slide
  // =========================

class Slide extends React.Component {
  constructor(props) {
    super(props)

    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleMouseLeave = this.handleMouseLeave.bind(this)
    this.handleSlideClick = this.handleSlideClick.bind(this)
    this.imageLoaded = this.imageLoaded.bind(this)
    this.handleButtonClick = this.handleButtonClick.bind(this)
    this.slide = React.createRef()
  }

  handleMouseMove(event) {
    const el = this.slide.current
    const r = el.getBoundingClientRect()

    el.style.setProperty('--x', event.clientX - (r.left + Math.floor(r.width / 2)))
    el.style.setProperty('--y', event.clientY - (r.top + Math.floor(r.height / 2)))
  }

  handleMouseLeave(event) {
    this.slide.current.style.setProperty('--x', 0)
    this.slide.current.style.setProperty('--y', 0)
  }

  handleSlideClick(event) {
    this.props.handleSlideClick(this.props.slide.index)
  }

  imageLoaded(event) {
    event.target.style.opacity = 1
  }

  handleButtonClick(event) {
    event.stopPropagation()
    window.location.href = this.props.slide.link
  }

  render() {
    const { src, button, headline, index } = this.props.slide
    const current = this.props.current
    let classNames = 'slide'

    if (current === index) classNames += ' slide--current'
    else if (current - 1 === index) classNames += ' slide--previous'
    else if (current + 1 === index) classNames += ' slide--next'

    return (
        <li
            ref={this.slide}
            className={classNames}
            onClick={this.handleSlideClick}
            onMouseMove={this.handleMouseMove}
            onMouseLeave={this.handleMouseLeave}
        >
          <div className="slide__image-wrapper">
            <img
                className="slide__image"
                alt={headline}
                src={src}
                onLoad={this.imageLoaded}
            />
          </div>

          <article className="slide__content">
            <h2 className="slide__headline">{headline}</h2>
            <button className="slide__action btn" onClick={this.handleButtonClick}>{button}</button>
          </article>
        </li>
    )
  }
}
  
  
  // =========================
  // Slider control
  // =========================
  
  const SliderControl = ({ type, title, handleClick }) => {
    return (
      <button className={`btn btn--${type}`} title={title} onClick={handleClick}>
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" />
        </svg>
      </button>
    )
  }
  
  
  // =========================
  // Slider
  // =========================
  
  class Slider extends React.Component {
    constructor(props) {
      super(props)
      
      this.state = { current: 1 }
      this.handlePreviousClick = this.handlePreviousClick.bind(this)
      this.handleNextClick = this.handleNextClick.bind(this)
      this.handleSlideClick = this.handleSlideClick.bind(this)
    }
    
    handlePreviousClick() {
      const previous = this.state.current - 1
          
      this.setState({ 
        current: (previous < 0) 
          ? this.props.slides.length - 1
          : previous
      })
    }
    
    handleNextClick() {
      const next = this.state.current + 1;
      
      this.setState({ 
        current: (next === this.props.slides.length) 
          ? 0
          : next
      })
    }
    
    handleSlideClick(index) {
      if (this.state.current !== index) {
        this.setState({
          current: index
        })
      }
    }
  
    render() {
      const { current, direction } = this.state
      const { slides, heading } = this.props 
      const headingId = `slider-heading__${heading.replace(/\s+/g, '-').toLowerCase()}`
      const wrapperTransform = {
        'transform': `translateX(-${current * (100 / slides.length)}%)`
      }
      
      return (
        <div className='slider' aria-labelledby={headingId}>
          <ul className="slider__wrapper" style={wrapperTransform}>
            <h3 id={headingId} class="visuallyhidden">{heading}</h3>
            
            {slides.map(slide => {
              return (
                <Slide
                  key={slide.index}
                  slide={slide}
                  current={current}
                  handleSlideClick={this.handleSlideClick}
                />
              )
            })}
          </ul>
          
          <div className="slider__controls">
            <SliderControl 
              type="previous"
              title="Go to previous slide"
              handleClick={this.handlePreviousClick}
            />
            
            <SliderControl 
              type="next"
              title="Go to next slide"
              handleClick={this.handleNextClick}
            />
          </div>
        </div>
      )
    }
  }
  
  
  export default function Carousel() {
    return (
      <div className="carousel-container">
        <div className="carousel">
          <Slider heading="Example Slider" slides={slideData} />
        </div>
      </div>
    )
  }