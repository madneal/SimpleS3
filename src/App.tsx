import "./App.css";
import {useNavigate, BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Option from './views/Option';

const Home = () => {
    const navigate = useNavigate();
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate('/option');
    }
    return (
        <div className="container">
            <form className="row" onSubmit={handleSubmit}>
                <input id="option-name" placeholder="Enter a name..." />
                <button type="submit">New</button>
            </form>
        </div>
    );
}

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/option" element={<Option onSubmit={(config) => console.log(config)} />} />
            </Routes>
        </Router>
    );
}

export default App;
