#include<iostream>
#include<algorithm>
using namespace std;
int b, c, d;
int main(){
    int N; cin >> N;
    while(N--){
        int x; cin >> x;
        x %= 1000; 
        x = (1000 - x)%1000;
        b += x / 100; x %= 100;
        c += x / 10; x %= 10;
        d += x;
        // printf("b:%d,c:%d,d:%d\n",b,c,d);
    }
    cout << d << " " << c << " " << b;
    return 0;
}