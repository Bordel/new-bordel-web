const canvas = document.getElementById('canvas'),
    ctx = canvas.getContext('2d'),
    canvas2 = document.getElementById('canvas2'),
    ctx2 = canvas2.getContext('2d'),
    // charArr = ['BORDEL'],
    charArr = ['B', 'O', 'R', 'D', 'E', 'L'],
    fallingCharArr = [],
    fontSize = 10;

// full screen dimensions, updated on resize
let cw, ch;


function randomInt( min, max ) {
    return Math.floor(Math.random() * ( max - min ) + min);
}

function randomFloat( min, max ) {
    return Math.random() * ( max - min ) + min;
}

function Point(x,y)
{
    this.x = x;
    this.y = y;
}

Point.prototype.draw = function(ctx){

    this.value = charArr[randomInt(0,charArr.length)].toUpperCase();
    this.speed = randomFloat(1,5);


    ctx2.fillStyle = "rgba(255,255,255,0.8)";
    ctx2.font = fontSize+"px sans-serif";
    ctx2.fillText(this.value,this.x,this.y);

    // ctx.fillStyle = "#0F0";
    ctx.fillStyle = "#00a400";
    ctx.font = fontSize+"px sans-serif";
    ctx.fillText(this.value,this.x,this.y);



    this.y += this.speed;
    if(this.y > ch)
    {
        this.y = randomFloat(-100,0);
        this.speed = randomFloat(2,5);
    }
}

function resize() {
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = canvas2.width = cw;
    canvas.height = canvas2.height = ch;

    // add or remove columns so they cover the full width
    const columns = Math.ceil(cw / fontSize);
    while (fallingCharArr.length < columns) {
        fallingCharArr.push(new Point(fallingCharArr.length * fontSize, randomFloat(-500, 0)));
    }
    fallingCharArr.length = columns;
}

resize();
window.addEventListener('resize', resize);


const update = function()
{

    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0,0,cw,ch);

    ctx2.clearRect(0,0,cw,ch);

    let i = fallingCharArr.length;

    while (i--) {
        fallingCharArr[i].draw(ctx);
    }

    requestAnimationFrame(update);
}

update();