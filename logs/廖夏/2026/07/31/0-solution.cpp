#include<iostream>
#include<algorithm>
using namespace std;
int p[10] = {6, 2, 5, 5, 4, 5, 6, 3, 7, 6};

int get_price (int x){
    int res = 0;
    if (x == 0) return p[0];
    while (x){
        res += p[x % 10];
        x /= 10;
    }
    return res;
}

int main(){
    int n; cin >> n;

    int res = 0;
    for (int A = 0; A <= 1000; A++){
        for (int B = 0; B <= 1000; B++){
            auto C = A + B;
            int price = get_price(A) + get_price(B) + get_price(C) + 4;
            if (price == n) res++;
        }
    }
    cout << res;
    return 0;
}