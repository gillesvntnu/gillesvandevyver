import React, { useEffect } from 'react';
import { BrowserRouter as HashRouter, Switch, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import './App.css';
import Home from './components/pages/Home';
import Products from './components/pages/Products';
import '@fortawesome/fontawesome-free/css/all.min.css';
import DataAnalytics from "./components/pages/project_pages/DataAnalytics";
import FindingHearts from "./components/pages/project_pages/FindingHearts";
import PatternRecognition from "./components/pages/project_pages/PatternRecognition";
import NaturalLanguageProcessing from './components/pages/project_pages/NaturalLanguageProcessing';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
      <>
        <HashRouter>
          <ScrollToTop />
          <Navbar />
          <Switch>
            <Route path='/' exact component={Home} />
            <Route path='/projects/data-analytics' component={DataAnalytics} />
            <Route path='/projects/finding-hearts' component={FindingHearts} />
            <Route path='/projects/pattern-recognition' component={PatternRecognition} />
            <Route path='/projects/natural-language-processing' component={NaturalLanguageProcessing} />
          </Switch>
        </HashRouter>
      </>
  );
}

export default App;