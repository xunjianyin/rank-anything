# Rank-Anything Web Application

A simple, responsive web application that allows users to create topics, add objects within those topics, and rate them with a 5-star system and optional text reviews.

## Features

### 🎯 **Two-Level Organization**
- **Topics**: High-level categories (e.g., "Peking University Cafeteria Dishes")
- **Objects**: Items within topics (e.g., "Shaoyuan Cafeteria Yellow Braised Chicken")

### ⭐ **Rating System**
- 1-to-5 star ratings
- Optional text reviews
- Average rating calculation
- Review count display

### 🏷️ **Tagging System**
- Add multiple tags to objects for categorization
- Visual tag display with styling
- Easy filtering and organization

### 💾 **Data Persistence**
- All data saved locally in browser storage
- No server required
- Data persists between sessions

### 📱 **Responsive Design**
- Clean, modern interface
- Mobile-friendly layout
- Intuitive navigation with breadcrumbs

## How to Use

### Getting Started
1. Open `index.html` in your web browser
2. Start by creating your first topic
3. Add objects to your topics
4. Rate and review objects

### Creating Topics
1. Click the "Add Topic" button on the homepage
2. Enter a descriptive name for your topic
3. Click "Add Topic" to save

### Adding Objects
1. Navigate to a topic by clicking on it
2. Click "Add Object" button
3. Enter the object name and optional tags (comma-separated)
4. Click "Add Object" to save

### Rating Objects
1. Click on any object to view its details
2. Select a star rating (1-5 stars)
3. Optionally add a text review
4. Click "Submit Rating" to save

### Navigation
- Click the logo to return to the homepage
- Use breadcrumb navigation to move between levels
- Click topic/object names to navigate back

## File Structure

```
rank-anything/
├── index.html          # Main HTML structure
├── styles.css          # CSS styling and responsive design
├── script.js           # JavaScript application logic
└── README.md          # Documentation
```

## Technical Details

### Technologies Used
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with gradients, shadows, and transitions
- **Vanilla JavaScript**: No frameworks or dependencies
- **Local Storage**: Browser-based data persistence
- **Font Awesome**: Icons
- **Google Fonts**: Inter font family

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers
- Requires JavaScript enabled

### Data Structure
```javascript
{
  topics: [
    {
      id: "unique_id",
      name: "Topic Name",
      createdAt: "ISO_date_string"
    }
  ],
  objects: {
    "topic_id": [
      {
        id: "unique_id",
        name: "Object Name",
        tags: ["tag1", "tag2"],
        createdAt: "ISO_date_string"
      }
    ]
  },
  ratings: {
    "topic_id": {
      "object_id": [
        {
          rating: 4,
          review: "Review text",
          createdAt: "ISO_date_string"
        }
      ]
    }
  }
}
```

## Sample Usage Examples

### Example 1: Restaurant Reviews
- **Topic**: "Downtown Restaurants"
- **Objects**: "Mario's Pizza", "Sushi Palace", "Burger Joint"
- **Tags**: "Italian", "Fast Food", "Japanese", "Expensive", "Casual"

### Example 2: Movie Collection
- **Topic**: "2023 Movies"
- **Objects**: "The Batman", "Top Gun: Maverick", "Avatar 2"
- **Tags**: "Action", "Drama", "Sci-Fi", "Sequel", "IMAX"

### Example 3: University Courses
- **Topic**: "Computer Science Courses"
- **Objects**: "Data Structures", "Machine Learning", "Web Development"
- **Tags**: "Programming", "Theory", "Practical", "Difficult", "Interesting"

## Customization

### Adding Sample Data
Uncomment the last line in `script.js` to load sample data on first visit:
```javascript
loadSampleData();
```

### Styling
Modify `styles.css` to customize:
- Color scheme (update CSS custom properties)
- Layout spacing
- Typography
- Component styling

### Functionality
Extend `script.js` to add:
- Export/import data functionality
- Search and filtering
- Sorting options
- Data validation
- Additional rating metrics

## Browser Storage

The application uses `localStorage` to persist data. Data is automatically saved when:
- Adding new topics
- Adding new objects
- Submitting ratings

To clear all data, open browser developer tools and run:
```javascript
localStorage.removeItem('rankAnythingData');
```

## License

This project is open source and available under the MIT License.

## Support

For issues or questions, please refer to the code comments or create an issue in the project repository. 