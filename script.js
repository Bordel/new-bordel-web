const canvas = document.getElementById('canvas'),
    ctx = canvas.getContext('2d'),
    canvas2 = document.getElementById('canvas2'),
    ctx2 = canvas2.getContext('2d'),
    // full screen dimensions
    cw = window.innerWidth,
    ch = window.innerHeight,
    // charArr = ['BORDEL'],
    charArr = ['B', 'O', 'R', 'D', 'E', 'L'],
    maxCharCount = 100,
    fallingCharArr = [],
    fontSize = 10,
    maxColums = cw / (fontSize);
canvas.width = canvas2.width = cw;
canvas.height = canvas2.height = ch;


function randomInt( min, max ) {
    console.log(Math.floor(Math.random() * ( max - min ) + min))
    return Math.floor(Math.random() * ( max - min ) + min);
}

function randomFloat( min, max ) {
    console.log(Math.random() * ( max - min ) + min)
    return Math.random() * ( max - min ) + min;
}

function Point(x,y)
{
    this.x = x;
    this.y = y;
}

Point.prototype.draw = function(ctx){

    this.value = charArr[randomInt(0,charArr.length-1)].toUpperCase();
    this.speed = randomFloat(1,5);


    ctx2.fillStyle = "rgba(255,255,255,0.8)";
    ctx2.font = fontSize+"px san-serif";
    ctx2.fillText(this.value,this.x,this.y);

    // ctx.fillStyle = "#0F0";
    ctx.fillStyle = "#00a400";
    ctx.font = fontSize+"px san-serif";
    ctx.fillText(this.value,this.x,this.y);



    this.y += this.speed;
    if(this.y > ch)
    {
        this.y = randomFloat(-100,0);
        this.speed = randomFloat(2,5);
    }
}

for(let i = 0; i < maxColums ; i++) {
    fallingCharArr.push(new Point(i*fontSize,randomFloat(-500,0)));
}


const update = function()
{

    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0,0,cw,ch);

    ctx2.clearRect(0,0,cw,ch);

    let i = fallingCharArr.length;

    while (i--) {
        fallingCharArr[i].draw(ctx);
        const v = fallingCharArr[i];
    }

    requestAnimationFrame(update);
}

update();