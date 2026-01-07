
import { extractAndRankExperts } from './server/ai/expertExtractor';
import { storage } from './server/storage';

async function testExtraction() {
  const testContent1 = `
Experts

- Expertise Topic: Consumer-based brands that garner a cult-like following in short periods of time; standout marketing; innovative products that go against the grain of their industry; standout packaging; non-toxic wellness and the harms of toxins on women
- Expert #1 - Sammi Tannor Cohen
  - Debunks consumer based brands on TikTok and Instagram, grew 100k followers in a month
  - Focus: Wall street, tech, culture, and brands/branding
  - Why follow: Sami's bite sized information is easy to follow along with, is packed with valuable information about products, consumer psychology, etc. She always cites her sources and the content is great to dissect for insights.
  - Where: [Sami Cohen Talks](https://www.instagram.com/sammicohentalks/?hl=en)
- Expert #2 - Kenda Laney
  - Kenda is an expert in social media strategy and internet personality. She provides unique insights on what ISN'T talked about in the industry, like using pinterest, etc.
  - Focus: Social strat, neuromarketing, organic content scaling
  - Who follow: Again, the value she provides is absolutely incredible. She has so many insights on posting to pinterest, increasing watch times on social media, etc.
  - Find her: [Kenda Laney](https://www.instagram.com/kenda.laney/?hl=en)
`;

  const testContent2 = `
Experts

- Expert 4 - Rich Paul
  - Who: American Sports Agent (mainly NBA) and the founder an CEO of Klutch Sports Group. Agent for LeBron James and many other noteworthy players. He is also co-head of the Sports division at United Talent Agency. 
  - Focus: Mainly manages contracts for NBA players but also focuses on some NCAA deals within the United Talent Agency. 
  - Why: He negotiates contracts for the highest-payed basketball athletes and has over 20 years of experience. 
  - Where: limited contact information -- @RichPaul4 on twitter
`;

  console.log("--- Testing Content 1 ---");
  const experts1 = await extractAndRankExperts({
    brainliftId: 1,
    title: "Test 1",
    description: "Test 1",
    author: "Test",
    facts: [],
    originalContent: testContent1
  });
  console.log("Extracted Experts 1:", JSON.stringify(experts1, null, 2));

  console.log("\n--- Testing Content 2 ---");
  const experts2 = await extractAndRankExperts({
    brainliftId: 1,
    title: "Test 2",
    description: "Test 2",
    author: "Test",
    facts: [],
    originalContent: testContent2
  });
  console.log("Extracted Experts 2:", JSON.stringify(experts2, null, 2));
}

testExtraction().catch(console.error);
