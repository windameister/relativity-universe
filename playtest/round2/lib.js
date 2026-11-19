const path=require('path');
const PROTO=path.join(__dirname,'..','..','prototype');
module.exports=function(file){
  return require(path.join(PROTO,'tools','simload'))(
    file && path.isAbsolute(file) ? file : path.join(PROTO, file || 'index.html')
  );
};
