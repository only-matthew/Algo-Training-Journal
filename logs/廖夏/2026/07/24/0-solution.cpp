#include <iostream>
#include <cstring>
using namespace std;
bool b[10 + 1];
struct Triple{
    int x, y ,z;
};
Triple got(int x){
    Triple tmp;
    tmp.x = x % 10;
    x /= 10;
    tmp.y = x % 10;
    x /= 10;
    tmp.z = x; 
    return tmp;
}
void mark(int x){
    auto a = got(x);
    b[a.x] = b[a.y] = b[a.z] = true;
}
bool check(int x, int y, int z){
    memset(b, 0, sizeof(b));
    mark(x); mark(y); mark(z);
    for (int i = 1; i <= 9; i++){
        if (!b[i]) return false;
    }
    return true;
}
int main(){
    bool found = false;
    int a, b, c; cin >> a >> b >> c;
    if (a == 0){ cout << "No!!!"; return 0; }  // 防止除零 RE
    for (int k = 123; k <= 987; k++){
        if (k * b % a || k * c % a) continue; // 不要忘记整除！！
        int y = k * b / a;
        int z = k * c / a;
        if (y > 987 || z > 987) break;
        if (check(k, y, z)){
            cout << k << " " << y << " " << z; 
            cout << "
";
            found = true;
        }
    }
    if (!found) cout << "No!!!";
    return 0;
}