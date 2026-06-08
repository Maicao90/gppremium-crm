const { Jimp } = require('jimp');

async function resize() {
  try {
    const img = await Jimp.read('C:\\Users\\MaiconBatn\\.gemini\\antigravity\\brain\\d442f609-881a-4d63-895f-bd30d7037e1d\\crm_mockup_1780920943815.png');
    img.resize({ w: 1280, h: 800 });
    await img.write('C:\\Users\\MaiconBatn\\Music\\extenção GP\\print_oficial_google.png');
    console.log('Success!');
  } catch(e) {
    console.error(e);
  }
}
resize();
