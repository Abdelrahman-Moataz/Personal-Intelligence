# OmniAgent: Your Personal Intelligence Companion

OmniAgent is a full-stack personal AI assistant designed to learn, remember, and grow with you. It combines advanced natural language processing with real-time memory extraction and interactive data visualization to create a truly personalized experience.

## 🚀 Features

- **🧠 Smart Memory Extraction**: Automatically identifies and saves your preferences, favorite places, and habits from conversations.
- **💬 Context-Aware Chat**: Engage in deep, meaningful conversations where the AI remembers your past interactions.
- **🖼️ Visual Memory**: Upload images for the AI to analyze and remember. It can identify objects, landmarks, and context to build a visual history.
- **🗺️ Interactive Interest Map**: A dynamic D3.js visualization that maps your core interests and AI-generated predictions.
- **📍 Real-World Recommendations**: Uses Google Search grounding to find highly-rated, specific places near you based on your unique profile.
- **👤 Personalized Profile**: Manage your identity, bio, and location to help OmniAgent better understand your context.
- **🔒 Secure & Private**: Powered by Firebase Authentication and Firestore with robust security rules.

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **AI/ML**: Google Gemini 3.1 (Flash & Pro), `@google/genai` SDK
- **Backend/Database**: Firebase (Firestore, Authentication)
- **Animations**: Motion (formerly Framer Motion)
- **Data Visualization**: D3.js
- **Icons**: Lucide React

## 📋 Prerequisites

Before you begin, ensure you have the following:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- A **Firebase Project** with Firestore and Authentication (Google Login) enabled.
- A **Google AI Studio API Key** (Gemini API).

## ⚙️ Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Abdelrahman-Moataz/Personal-Intelligence.git
   cd Personal-Intelligence
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file in the root directory and add your credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

## 🛡️ Security Rules

Ensure you deploy the provided `firestore.rules` to your Firebase project to protect user data. The rules enforce strict ownership, ensuring users can only access their own memories and messages.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Built with ❤️ using Google AI Studio.
