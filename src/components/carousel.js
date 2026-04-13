import React from 'react';
import './carousel.scss';
import data_analytics_pic from '../images/data_analytics/data_analytics.jpeg'
import computer_vision_pic from '../images/finding_hearts/computer_vision_meddical_imaging.jpg'
import quality_pic from '../images/finding_hearts/quality_pic7.jpg'
import spectrogram_pic from '../images/pattern-recognition/sound_waves.jpeg'
import gen_ai_transition from '../images/gen_ai/gen_ai_transition.gif'
import chatbot_pic from '../images/agentic_ai/chatbot.png'
import strain_pic from '../images/ImprovingClinicalMeasurements/strain.png'

const slideData = [
  // {
  //   index: 0,
  //   headline: 'Data Analytics',
  //   button: 'Find out more',
  //   src: data_analytics_pic,
  //   link: '#/projects/data-analytics'
  // },
  {
    index: 0,
    headline: 'Robust computer vision',
    button: 'Find out more',
    src: computer_vision_pic,
    link: '#/projects/robust-computer-vision'
  },
  {
    index: 1,
    headline: 'Agentic AI',
    button: 'Find out more',
    src: chatbot_pic,
    link: '#/projects/agentic-ai'
  },
  {
    index: 2,
    headline: 'Generative AI',
    button: 'Find out more',
    src: gen_ai_transition,
    link: '#/projects/generative-ai'
  },
  {
    index: 3,
    headline: 'Image quality',
    button: 'Find out more',
    src: quality_pic,
    link: '#/projects/image-quality'
  },
  {
    index: 4,
    headline: 'Improving clinical measurements',
    button: 'Find out more',
    src: strain_pic,
    link: '#/projects/improving-clinical-measurements'
  },
  // {
  //   headline: 'Pattern recognition',
  //   button: 'Find out more',
  //   src: spectrogram_pic,
  //   link: '#/projects/pattern-recognition'
  // },
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
      this.touchStartX = 0
      this.touchEndX = 0
      this.autoPlayInterval = null
      this.idleTimeout = null
      this.handlePreviousClick = this.handlePreviousClick.bind(this)
      this.handleNextClick = this.handleNextClick.bind(this)
      this.handleSlideClick = this.handleSlideClick.bind(this)
      this.handleTouchStart = this.handleTouchStart.bind(this)
      this.handleTouchMove = this.handleTouchMove.bind(this)
      this.handleTouchEnd = this.handleTouchEnd.bind(this)
      this.startAutoPlay = this.startAutoPlay.bind(this)
      this.stopAutoPlay = this.stopAutoPlay.bind(this)
      this.resetIdleTimer = this.resetIdleTimer.bind(this)
    }

    componentDidMount() {
      this.startAutoPlay()
    }

    componentWillUnmount() {
      this.stopAutoPlay()
      clearTimeout(this.idleTimeout)
    }

    startAutoPlay() {
      this.stopAutoPlay()
      this.autoPlayInterval = setInterval(() => {
        const next = this.state.current + 1
        this.setState({
          current: (next === this.props.slides.length) ? 0 : next
        })
      }, 3000)
    }

    stopAutoPlay() {
      if (this.autoPlayInterval) {
        clearInterval(this.autoPlayInterval)
        this.autoPlayInterval = null
      }
    }

    resetIdleTimer() {
      this.stopAutoPlay()
      clearTimeout(this.idleTimeout)
      this.idleTimeout = setTimeout(() => {
        this.startAutoPlay()
      }, 3000)
    }

    handlePreviousClick() {
      const previous = this.state.current - 1

      this.setState({
        current: (previous < 0)
          ? this.props.slides.length - 1
          : previous
      })
      this.resetIdleTimer()
    }

    handleNextClick() {
      const next = this.state.current + 1;

      this.setState({
        current: (next === this.props.slides.length)
          ? 0
          : next
      })
      this.resetIdleTimer()
    }

    handleSlideClick(index) {
      if (this.state.current !== index) {
        this.setState({
          current: index
        })
      }
      this.resetIdleTimer()
    }

    handleTouchStart(e) {
      this.touchStartX = e.touches[0].clientX
      this.touchEndX = e.touches[0].clientX
      this.touchMoved = false
    }

    handleTouchMove(e) {
      this.touchEndX = e.touches[0].clientX
      this.touchMoved = true
    }

    handleTouchEnd() {
      const delta = this.touchStartX - this.touchEndX
      const minSwipeDistance = 50

      if (this.touchMoved && Math.abs(delta) >= minSwipeDistance) {
        if (delta > 0) {
          this.handleNextClick()
        } else {
          this.handlePreviousClick()
        }
      }

      this.touchStartX = 0
      this.touchEndX = 0
    }

    render() {
      const { current } = this.state
      const { slides, heading } = this.props
      const headingId = `slider-heading__${heading.replace(/\s+/g, '-').toLowerCase()}`
      const wrapperTransform = {
        'transform': `translateX(-${current * (100 / slides.length)}%)`
      }

      return (
        <div
          className='slider'
          aria-labelledby={headingId}
          onTouchStart={this.handleTouchStart}
          onTouchMove={this.handleTouchMove}
          onTouchEnd={this.handleTouchEnd}
        >
          <ul className="slider__wrapper" style={wrapperTransform}>
            <h3 id={headingId} className="visuallyhidden">{heading}</h3>

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