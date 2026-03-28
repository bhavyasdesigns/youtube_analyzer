# YouTube Competitor Analyzer

A simple web app that allows users to analyze a YouTube channel and quickly identify top-performing videos.

## Features

- Paste a YouTube channel URL
- View recent videos with key metrics (views, publish date)
- Sort videos by most viewed or latest
- Trending indicator based on performance
- Visual chart for quick comparison
- Responsive, clean UI

## Tech Stack

- Next.js
- Tailwind CSS
- YouTube Data API
- Cursor
- Recharts
- Vercel (deployment)

## Setup Instructions

1. Clone the repository
2. Run `npm install`
3. Add your API key in a `.env.local` file
4. Run `npm run dev`
5. Open `http://localhost:3000`

## Approach

I built this project step by step, starting with a basic working version and then improving it with better UI, sorting, and trending insights.

I focused on making the data easy to understand rather than just displaying raw numbers.

The goal was to help users quickly understand what content is performing well on a competitor’s channel.

Instead of focusing only on data, I prioritized:
- Clear visual hierarchy
- Sorting and filtering
- Highlighting trending content

## AI-Assisted Workflow

- Used ChatGPT for API integration and debugging
- Used Cursor to refine UI, improve layout, and speed up development

## Future Improvements

- Engagement metrics (likes, comments)
- AI-based insights on why videos perform well
- Comparison between multiple channels
- Export functionality

