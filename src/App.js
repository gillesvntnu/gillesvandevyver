import React, { useEffect } from 'react';
import { BrowserRouter as Router, Switch, Route, useLocation } from 'react-router-dom';
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
        <Router>
          <ScrollToTop />
          <Navbar />
          <Switch>
            <Route path='/gillesvandevyver' exact component={Home} />
            <Route path='/gillesvandevyver/projects/data-analytics' component={DataAnalytics} />
            <Route path='/gillesvandevyver/projects/finding-hearts' component={FindingHearts} />
            <Route path='/gillesvandevyver/projects/pattern-recognition' component={PatternRecognition} />
            <Route path='/gillesvandevyver/projects/natural-language-processing' component={NaturalLanguageProcessing} />
          </Switch>
        </Router>
      </>
  );
}

export default App;