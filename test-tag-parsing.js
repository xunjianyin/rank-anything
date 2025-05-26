// Test file for tag parsing functionality
function parseAndCleanTags(tagsInput) {
    if (!tagsInput || typeof tagsInput !== 'string') {
        return [];
    }
    
    // Split by various delimiters: comma, Chinese comma, semicolon, Chinese semicolon, Chinese enumeration mark
    const delimiters = /[,，;；、]/;
    const rawTags = tagsInput.split(delimiters);
    
    const cleanedTags = rawTags
        .map(tag => {
            // Trim whitespace
            tag = tag.trim();
            
            // Remove symbols at the beginning and end that are not letters, Chinese characters, or numbers
            // Keep only: a-z, A-Z, 0-9, Chinese characters (Unicode ranges), and spaces in the middle
            tag = tag.replace(/^[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]+/, '');
            tag = tag.replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f\s]+$/, '');
            
            return tag;
        })
        .filter(tag => tag.length > 0) // Remove empty tags
        .filter((tag, index, array) => array.indexOf(tag) === index); // Remove duplicates
    
    return cleanedTags;
}

// Test cases
console.log('Testing tag parsing functionality:');
console.log('');

// Test 1: Basic comma separation
console.log('Test 1 - Basic comma separation:');
const test1 = parseAndCleanTags('tag1, tag2, tag3');
console.log('Input: "tag1, tag2, tag3"');
console.log('Output:', test1);
console.log('Expected: ["tag1", "tag2", "tag3"]');
console.log('');

// Test 2: Chinese delimiters
console.log('Test 2 - Chinese delimiters:');
const test2 = parseAndCleanTags('北京大学，食堂；黄焖鸡、微辣');
console.log('Input: "北京大学，食堂；黄焖鸡、微辣"');
console.log('Output:', test2);
console.log('Expected: ["北京大学", "食堂", "黄焖鸡", "微辣"]');
console.log('');

// Test 3: Mixed delimiters
console.log('Test 3 - Mixed delimiters:');
const test3 = parseAndCleanTags('tag1,tag2；tag3、tag4，tag5;tag6');
console.log('Input: "tag1,tag2；tag3、tag4，tag5;tag6"');
console.log('Output:', test3);
console.log('Expected: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]');
console.log('');

// Test 4: Symbol removal
console.log('Test 4 - Symbol removal:');
const test4 = parseAndCleanTags('#tag1#, @tag2@, _tag3_, !tag4!');
console.log('Input: "#tag1#, @tag2@, _tag3_, !tag4!"');
console.log('Output:', test4);
console.log('Expected: ["tag1", "tag2", "tag3", "tag4"]');
console.log('');

// Test 5: Duplicates removal
console.log('Test 5 - Duplicates removal:');
const test5 = parseAndCleanTags('tag1, tag2, tag1, tag3, tag2');
console.log('Input: "tag1, tag2, tag1, tag3, tag2"');
console.log('Output:', test5);
console.log('Expected: ["tag1", "tag2", "tag3"]');
console.log('');

// Test 6: Empty and whitespace handling
console.log('Test 6 - Empty and whitespace handling:');
const test6 = parseAndCleanTags('tag1,  , tag2,   ,tag3');
console.log('Input: "tag1,  , tag2,   ,tag3"');
console.log('Output:', test6);
console.log('Expected: ["tag1", "tag2", "tag3"]');
console.log('');

// Test 7: Complex mixed case
console.log('Test 7 - Complex mixed case:');
const test7 = parseAndCleanTags('##北京大学##，@食堂@；_黄焖鸡_、!微辣!，Spicy Food');
console.log('Input: "##北京大学##，@食堂@；_黄焖鸡_、!微辣!，Spicy Food"');
console.log('Output:', test7);
console.log('Expected: ["北京大学", "食堂", "黄焖鸡", "微辣", "Spicy Food"]');
console.log('');

console.log('All tests completed!'); 