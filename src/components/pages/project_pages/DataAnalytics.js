import React from 'react';
import './CommonStyles.css';
import powerbi_img from '../../../images/data_analytics/powerbi_sweco_example_no_bg.png';
import sarimax_img from '../../../images/data_analytics/sarimax.png';

function DataAnalytics() {
    return (
        <div className="project-page-container">
            <h1>Data Analytics</h1>
            <div className="tldr">
                <p><strong>TL;DR: </strong>
                    Data analytics projects at ArcelorMittal and Sweco Belgium with focus on using statistics
                    and classical machine learning to analyze employee behavior and work environments,
                    emphasizing clear reporting and data visualization.
                    <br/>
                    <strong>Technologies used:</strong> Python (Scikit-learn), Time Series Forecasting,
                    Power BI
                </p>
            </div>
            <div className="horizontal-card">
                <div>
                    <h2>Charging behaviour of employees at Sweco</h2>
                    <p>
                        In Belgium, a company car is a common benefit for employees, especially for consultancy firms.
                        In 2021, Sweco was in the middle of transitioning from fossil-fuel cars to electric cars
                        for their employees. The company wanted to gain insight into the charging behavior of their
                        employees. After all, Sweco covers the fuel and electricity costs. They wondered
                        what basic information about the employees could tell them about their charging behavior.
                        For example, does the distance between the home and the office influence the charging behavior?
                        Does the type of car influence the charging behavior? What about the size of the battery?
                        How many charging points are needed at the office?
                        <br/><br/>
                        My role in this project was to analyze the data and provide insights to Sam Van Mulders,
                        the then chief data officer at Sweco.
                        After extensive data cleaning, I used statistics and classical machine learning with the
                        Scikit-learn library in Python to analyze the data and predict the charging behavior of
                        employees.
                        I used Power BI to visualize the results with interactive dashboards. This tool really helps
                        to condense the insights into a clear and concise report.
                    </p>
                </div>
                <div className="image-container">
                    <img src={powerbi_img} alt="Data Analytics" className="project-page-image-right"/>
                    <p> The values in the image are made up. The real data is confidential.</p>
                </div>
            </div>
            <div className="vertical-card">
                <p>
                    <h2>Safety at ArcelorMittal</h2>
                    As an industrial steel giant with a long history of fatal incidents, safety is a top priority
                    at ArcelorMittal Ghent in Belgium. The company wanted to analyze how the safety numbers evolved
                    and what macro-factors influenced the safety numbers. Their database contained information about
                    the incidents, minor injuries, near misses, and reports of unsafe situations that occurred
                    at the plant on a daily basis for several years.
                    <br/><br/>
                    My contribution to this project involved analyzing the data using time series analysis and
                    forecasting. A common method for time series forecasting is the so-called ARIMA model,
                    which was a good starting point for this project.
                    These kinds of models are much simpler than neural networks and in this case, this simplicity
                    was a strength.
                    The model was easy to interpret and worked well with the relatively small
                    dataset.
                    When analyzing the data, I noticed that the safety numbers were largely influenced by the
                    time of the year and week.
                    For instance, incidents tended to be higher on Fridays and Mondays or just before the summer
                    holidays.
                    I also noticed a pattern where, after major events like safety
                    awareness projects or significant incidents, the number of reports about unsafe situations
                    increased, while the actual number of incidents decreased. Digging deeper into the data,
                    there was a clear inverse relationship between the number of incidents and the number of reports.
                    A prime example of survivorship bias.
                    <br/><br/>
                    The final framework consisted mainly of SARIMAX models, a variant of the ARIMA
                    model that takes seasonality and external variables into account.
                    The model gave a guideline on which numbers of reports are normal and which are worrying.
                    This information could then be used for example to plan safety awareness campaigns
                    at strategic times and to decide where to put the focus on.
                </p>
                <div className="image-container">
                    <img src={sarimax_img} alt="Data Analytics" className="project-page-image-right"/>
                    <p> The values in the image are made up. The real data is confidential.</p>
                </div>
            </div>
        </div>
    );
}

export default DataAnalytics;