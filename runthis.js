const { ServicePrincipalCredentials, PDFServices, MimeType, ExtractPDFParams, ExtractElementType, ExtractPDFJob, ExtractPDFResult } = require('@adobe/pdfservices-node-sdk');
const fs = require('fs');
const AdmZip = require('adm-zip');
const path = require('path');

const jsonFilePath = path.join(__dirname, 'pdfservices-api-credentials.json');

let pdfServices;

// Function to initialize PDF Services
const initializePDFServices = () => {
  return new Promise((resolve, reject) => {
    fs.readFile(jsonFilePath, 'utf8', (err, data) => {
      if (err) {
        return reject('Error reading the JSON file: ' + err);
      }

      try {
        const jsonData = JSON.parse(data);
        process.env.PDF_SERVICES_CLIENT_ID = jsonData.client_credentials.client_id;
        process.env.PDF_SERVICES_CLIENT_SECRET = jsonData.client_credentials.client_secret;

        const credentials = new ServicePrincipalCredentials({
          clientId: process.env.PDF_SERVICES_CLIENT_ID,
          clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET
        });
        
        pdfServices = new PDFServices({ credentials });
        resolve();
      } catch (err) {
        reject('Error parsing the JSON data: ' + err);
      }
    });
  });
};

function extractTextFromJSON(pdfJson) {
    const textElements = [];
  
    function extractText(element) {
        // if (element.text) {
        //     textElements.push(element.text);
        // }
        for (const key in element) {
            if (Array.isArray(element[key]) && key === "elements") {
                for (const item of element[key]) {
                    if (typeof item === 'object' && item['Text']) {
                        // extractText(item);
                        textElements.push(item['Text']);
                    }
                }
            }
        }
    }

    extractText(pdfJson);
    return textElements;
}

const processPDF = async () => {
  try {
    await initializePDFServices();

    const inputAsset = await pdfServices.upload({
      readStream: fs.createReadStream('./files/filetoscan.pdf'),
      mimeType: MimeType.PDF
    });

    const params = new ExtractPDFParams({
      elementsToExtract: [ExtractElementType.TEXT]
    });

    const job = new ExtractPDFJob({ inputAsset, params });

    const pollingURL = await pdfServices.submit({ job });
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: ExtractPDFResult
    });

    const resultAsset = pdfServicesResponse.result.resource;
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    const outputFilePath = "./output/ExtractTextInfoFromPDF.zip";
    console.log(`Saving asset at ${outputFilePath}`);

    const writeStream = fs.createWriteStream(outputFilePath);
    streamAsset.readStream.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log('Extraction complete');
      const zip = new AdmZip(outputFilePath);
      const extractDir = path.join(__dirname, 'output');
      zip.extractAllTo(extractDir, true);
      console.log(`Files extracted to ${extractDir}`);

      // Read the extracted JSON file
      const jsondata = fs.readFileSync(path.join(extractDir, 'structuredData.json'), 'utf8');
      const data = JSON.parse(jsondata);
      
      // Use the extractTextFromJSON function to filter and get text elements
      const textElements = extractTextFromJSON(data);

      // Write the text elements to a new JSON file
      const outputJsonFilePath = './output/extractedText.json';
      const jsonOutput = { textElements: textElements };
      fs.writeFile(outputJsonFilePath, JSON.stringify(jsonOutput, null, 2), (err) => {
        if (err) {
          console.error('Error writing text to JSON file:', err);
        } else {
          console.log(`Text successfully written to ${outputJsonFilePath}`);
        }
      });
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
};

processPDF();
