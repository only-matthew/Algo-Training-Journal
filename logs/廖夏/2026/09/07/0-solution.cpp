#include<iostream>
#include<algorithm>
#include<cmath>
#include<cstdio>
using namespace std;
double a, b, c, d;
double cal(double x){return a*x*x*x + b*x*x + c*x + d;}
double find(double l, double r){
    while (r - l > 0.001){
        double m = (l + r) / 2;
        if (cal(m) * cal(r) <= 0) l = m;
        else r = m;
    }
    return r;
}
int main(){
    cin >> a >> b >> c >> d;
    for (int i = -100; i < 100; i++){
        double l = 1.0*i, r = 1.0*i + 1;
        double x1 = cal(l), x2 = cal(r);
        if (!x1) {
            printf("%0.2lf ", l);
            continue;
        }
        else if (x1 * x2 < 0){
            printf("%0.2lf ", find(l,r));
        }
    }
}