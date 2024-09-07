const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const Contest = require('./models/Contest');  

const app = express();
const PORT = 3000;
const docker = new Docker();

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/codingapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Schemas
const problemSchema = new mongoose.Schema({
  name: String,
  description: String,
  testcases: Array,
  constraints: String,
  level: String
});
const Problem = mongoose.model('Problem', problemSchema);

const contestSchema = new mongoose.Schema({
  name: String,
  startDate: Date,
  duration: Number,
  problems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problem' }],
  status: String  // 'upcoming', 'active', 'completed'
});
const Contest = mongoose.model('Contest', contestSchema);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// API Endpoints
app.get('/api/problems', async (req, res) => {
  try {
    const problems = await Problem.find();
    res.json(problems);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.use(express.json());

// Create a contest
app.post('/api/contests', async (req, res) => {
  try {
    const contest = new Contest(req.body);
    await contest.save();
    res.status(201).send(contest);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Fetch all contests
app.get('/api/contests', async (req, res) => {
  try {
    const contests = await Contest.find();
    res.send(contests);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Fetch problems for a specific contest
app.get('/api/contests/:id/problems', async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).populate('problems');
    res.send(contest.problems);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Start a contest
app.patch('/api/contests/:id/start', async (req, res) => {
  try {
    const contest = await Contest.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    res.send(contest);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Fetch a single contest with populated problems
app.get('/api/contests/:id', async (req, res) => {
  try {
      const contest = await Contest.findById(req.params.id).populate('problems');
      if (!contest) {
          res.status(404).send({ message: 'Contest not found' });
      } else {
          res.json(contest);
      }
  } catch (error) {
      res.status(500).send({ message: 'Error retrieving contest details', error });
  }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/api/run-code', (req, res) => {
  const { code, language, userInput } = req.body;
  const tempDir = path.join(__dirname, 'tempCode');
  const codeFile = path.join(tempDir, `code.${getFileExtension(language)}`);
  const inputFile = path.join(tempDir, 'input.txt');
  const outputFile = path.join(tempDir, 'output.txt');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  fs.writeFileSync(codeFile, code);
  fs.writeFileSync(inputFile, userInput);

  const dockerImage = getDockerImage(language);
  const dockerCommand = `docker run --rm -v "${path.resolve(tempDir)}:/app" -w "/app" ${dockerImage} /bin/sh -c "${getRunCommand(language, 'code', 'input.txt', 'output.txt')}"`;

  exec(dockerCommand, (error, stdout, stderr) => {
    if (error || stderr) {
      console.error("Execution Error:", error, stderr);
      return res.status(500).json({ error: "Execution failed", details: stderr || error.message });
    }

    fs.readFile(outputFile, 'utf8', (readError, output) => {
      if (readError) {
        console.error("File Read Error:", readError);
        return res.status(500).json({ error: "Error reading output file", details: readError.message });
      }

      res.json({ result: output.trim() });
    });
  });
});


// Determine Docker image based on language
function getDockerImage(language) {
  switch (language) {
    case 'c_cpp': return 'gcc:latest';
    case 'java': return 'openjdk:latest';
    case 'python': return 'python:latest';
    case 'javascript': return 'node:latest';
    default: return 'alpine:latest';
  }
}

// Construct command to run code based on language
function getRunCommand(language, codeFileName, inputFile, outputFile) {
  switch (language) {
    case 'c_cpp': return `g++ ${codeFileName}.cpp -o executable && ./executable < ${inputFile} > ${outputFile}`;
    case 'java': return `javac ${codeFileName}.java && java ${codeFileName} < ${inputFile} > ${outputFile}`;
    case 'python': return `python ${codeFileName}.py < ${inputFile} > ${outputFile}`;
    case 'javascript': return `node ${codeFileName}.js < ${inputFile} > ${outputFile}`;
    default: return `echo Unsupported language`;
  }
}

// Get file extension based on language
function getFileExtension(language) {
  switch (language) {
    case 'c_cpp': return 'cpp';
    case 'java': return 'java';
    case 'python': return 'py';
    case 'javascript': return 'js';
    default: return '';
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
