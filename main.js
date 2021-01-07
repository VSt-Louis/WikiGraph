const axios = require('axios');
const htmlParser = require('node-html-parser');

const args = process.argv.slice(2);

//config
const domain = 'https://en.wikipedia.org';
const DEPTH_LIMIT = args[2] || 100000;

//test function
const getArticle = (name) => {
  return axios.get(domain + '/wiki/' + name)
  .then((response) => {
    return response.data;
  }).catch(err => {
    console.err(err)
  });
}

//checks if article contains redirect instruction by looking for a <link rel="canonical"> tag
const getCanonical = (articleDom) => {
  let canonicalLinks = articleDom.querySelectorAll('link').filter(link => {return link.rawAttrs.match(/rel="canonical"/)});
  if (canonicalLinks.length > 0) {
    //the regex finds the redirect target, the split take what is before the # symbol.
    let newName = canonicalLinks[0].rawAttrs.match(new RegExp('href="' + domain + '/wiki/(.+?)"'))[1].split('#')[0];
    return newName;
  }
}

const getArticleDom = (name) => {
  return axios.get(domain + '/wiki/' + name)
  .then((response) => {
    //use parser to transform http response into DOM
    let dom = htmlParser.parse(response.data);
    /*//check if article redirects
    let newName = getCanonical(dom);
    if (newName) {
      //simulate redirect
      if (newName != name) {
      console.log('NEW NAME: ' + newName + '(old name: ' + name + ')')
        return getArticleDom(newName);
      }
    } */
    return dom;
  });
}

const getLinksNameInArticleDom = (article) => {
  let links = article.querySelectorAll('a');
  
  let selfName = links.find(link => {
    //find the "Article" tab's link to get the present article's name
    return link.rawAttrs.match(/title="View the content page/);
  }).rawAttrs.match(/href="\/wiki\/(.+?)"/)[1];
  
  let exclude = [
    //filter out links to files/images
    /^File:/,
    
    //filter out links to help pages
    /^Help:/,
     
    //filter out links to category pages
    /^Category:/,
     
    //filter out links to pages other than articles
    /^Wikipedia:/,
     
    //filter out links to special pages
    /^Special:/,
     
    //filter out links to portal pages
    /^Portal:/,
     
    //filter out links to the main page
    /^Main_Page/,
     
    //filter out links to talk pages
    /^Talk:/,
     
    //filter out links to template pages
    /^Template:/,
     
    //filter out links to template_talk pages
    /^Template_talk:/,
     
    //filter out links to book pages
    /^Book:/
  ];
  
  return links.filter(link => {
    //filter to keep only links who have a href pointing to /wiki/*
    return link.rawAttrs.match(/href="\/wiki\//);
  }).map(link => {
    let match = link.rawAttrs.match(/href="\/wiki\/(.+?)"/);
    return match[1];
  }).filter(href => {
    let cond = exclude.reduce((acc, test) => acc || test.test(href), false) || href == selfName; //filter out links to the page itself
    return !cond;
  });
}

const scanFor = async (article, targetName) => {
  console.log('scanning:    ' + article.canonical);
  let links = await Promise.all(getLinksNameInArticleDom(article.dom).map(async name => {
    let dom = await getArticleDom(name);
    let canonical = getCanonical(dom) || name;
    let pathToNode = [...article.pathToNode, canonical];
    console.log('-> ' + canonical)
    return {canonical, dom, pathToNode};
  }));
  if (links.map(link => link.canonical).includes(targetName)) {
    return {targetIsChild: true, path: [...article.pathToNode, targetName]};
  } else {
    return {targetIsChild: false, path: [...article.pathToNode], nextSet: links};
  }
}

const findPath = async (from, to) => {
  console.log(`Searching for a path between ${from} and ${to}`);
  
  //initialise an empty array that will contain arrays of candidates to scan for target article
  let nodeSetsToScan = [];
  
  //add the starting article to the array
  nodeSetsToScan.push([{
    canonical: from,
    dom: await getArticleDom(from),
    pathToNode: [from]
  }]);
  
  //couter to mesure search depth in the tree of articles, depth 0 being the starting 
  let depth = 0;
  while (depth < DEPTH_LIMIT) {
    //retrieves the next set of nodes to scan (the next layer)
    let nextNodeSet = nodeSetsToScan.shift();
    
    //begin scanning the layer
    for (nextNode of nextNodeSet) {
      //scan
      let scanResult = await scanFor(nextNode, to, );
      //check if target was found
      if (scanResult.targetIsChild) {
        return scanResult.path;
      } else {
        console.log(`Didn\'t find ${to} in ${nextNode.canonical}, trying next article...`);
        //add new nodes to array
        nodeSetsToScan.push(scanResult.nextSet);
        //set path to match that of the recently scanned node
      }
      path = scanResult.path;
    }
    
    depth++;
    console.log(`Didn\'t find ${to} at this level, moving to depth ${depth}`);
  }
  return "Loop limit exceeded"
}

findPath(args[0], args[1]).then(console.log);